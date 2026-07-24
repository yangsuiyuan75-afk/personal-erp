import { Readable } from 'node:stream'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { FileAssetStatus, MasterDataStatus, Prisma } from '@prisma/client'
import { paginationMeta, type ListQueryDto } from '../../common/dto/list-query.dto'
import { PrismaService } from '../../database/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { AuthUser } from '../auth/auth.types'
import { MASTER_RESOURCES, type MasterResource } from './master-data.config'
import type { MasterDataPayloadDto } from './dto/master-data-payload.dto'

type Delegate = {
  findMany(args: unknown): Promise<Record<string, any>[]>
  findUnique(args: unknown): Promise<Record<string, any> | null>
  count(args: unknown): Promise<number>
  create(args: unknown): Promise<Record<string, any>>
  update(args: unknown): Promise<Record<string, any>>
}

const INCLUDES: Partial<Record<MasterResource, Record<string, unknown>>> = {
  products: {
    category: { select: { id: true, name: true, status: true } },
    images: {
      where: { fileAsset: { status: FileAssetStatus.SYNCED } },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { fileAsset: { select: { id: true, fileName: true } } },
    },
  },
  skus: {
    product: { select: { id: true, name: true, status: true } },
    baseUnit: { select: { id: true, name: true, status: true } },
  },
  suppliers: { purchaseChannel: { select: { id: true, name: true, status: true } } },
  customers: { defaultSalesChannel: { select: { id: true, name: true, status: true } } },
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined || value === '') {
    throw new UnprocessableEntityException({ code: 'FIELD_REQUIRED', message: `${label}不能为空` })
  }
  return value
}

function csvCell(value: unknown): string {
  const raw = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  assertResource(resource: string): asserts resource is MasterResource {
    if (!(resource in MASTER_RESOURCES)) {
      throw new BadRequestException({ code: 'RESOURCE_INVALID', message: '不支持的基础资料类型' })
    }
  }

  async list(resourceInput: string, query: ListQueryDto) {
    this.assertResource(resourceInput)
    const resource = resourceInput
    const config = MASTER_RESOURCES[resource]
    if (!(config.sort as readonly string[]).includes(query.sortBy)) {
      throw new BadRequestException({ code: 'SORT_INVALID', message: '排序字段不在白名单中' })
    }
    const where = this.buildWhere(resource, query)
    const delegate = this.delegate(resource)
    const [rows, total] = (await this.prisma.$transaction([
      delegate.findMany({
        where,
        include: INCLUDES[resource],
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }) as never,
      delegate.count({ where }) as never,
    ])) as [Record<string, any>[], number]
    return {
      data: rows,
      meta: paginationMeta(query.page, query.pageSize, total),
    }
  }

  async detail(resourceInput: string, id: string) {
    this.assertResource(resourceInput)
    const row = await this.delegate(resourceInput).findUnique({
      where: { id },
      include: INCLUDES[resourceInput],
    })
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: '记录不存在' })
    return row
  }

  async create(
    resourceInput: string,
    payload: MasterDataPayloadDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    this.assertResource(resourceInput)
    const data = await this.createData(resourceInput, payload)
    try {
      const row = await this.delegate(resourceInput).create({
        data,
        include: INCLUDES[resourceInput],
      })
      await this.audit.record({
        userId: actor.id,
        module: 'MASTER_DATA',
        action: 'CREATE',
        entityType: resourceInput,
        entityId: String(row.id),
        after: row,
        requestId,
      })
      return row
    } catch (error) {
      this.rethrowPrisma(error)
    }
  }

  async update(
    resourceInput: string,
    id: string,
    payload: MasterDataPayloadDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    this.assertResource(resourceInput)
    const before = await this.detail(resourceInput, id)
    const data = await this.updateData(resourceInput, payload)
    try {
      const row = await this.delegate(resourceInput).update({
        where: { id },
        data,
        include: INCLUDES[resourceInput],
      })
      await this.audit.record({
        userId: actor.id,
        module: 'MASTER_DATA',
        action: 'UPDATE',
        entityType: resourceInput,
        entityId: id,
        before,
        after: row,
        requestId,
      })
      return row
    } catch (error) {
      this.rethrowPrisma(error)
    }
  }

  async deactivate(resourceInput: string, id: string, actor: AuthUser, requestId?: string) {
    this.assertResource(resourceInput)
    const before = await this.detail(resourceInput, id)
    const row = await this.delegate(resourceInput).update({
      where: { id },
      data: { status: MasterDataStatus.INACTIVE },
      include: INCLUDES[resourceInput],
    })
    await this.audit.record({
      userId: actor.id,
      module: 'MASTER_DATA',
      action: 'DEACTIVATE',
      entityType: resourceInput,
      entityId: id,
      before,
      after: row,
      requestId,
    })
    return row
  }

  exportCsv(resourceInput: string, query: ListQueryDto): Readable {
    this.assertResource(resourceInput)
    const list = this.list.bind(this)
    const fields = MASTER_RESOURCES[resourceInput].csv
    const limit = query.exportLimit ?? 10_000
    return Readable.from(
      (async function* () {
        yield `\uFEFF${fields.map(csvCell).join(',')}\r\n`
        let page = 1
        let emitted = 0
        while (emitted < limit) {
          const result = await list(resourceInput, { ...query, page, pageSize: 100 })
          for (const row of result.data as Record<string, unknown>[]) {
            if (emitted >= limit) break
            yield `${fields.map((field) => csvCell(row[field])).join(',')}\r\n`
            emitted += 1
          }
          if (!result.meta.hasNextPage) break
          page += 1
        }
      })(),
    )
  }

  private delegate(resource: MasterResource): Delegate {
    return (this.prisma as unknown as Record<string, Delegate>)[MASTER_RESOURCES[resource].delegate]
  }

  private buildWhere(resource: MasterResource, query: ListQueryDto): Record<string, unknown> {
    const config = MASTER_RESOURCES[resource]
    const where: Record<string, unknown> = {}
    if (query.status) where.status = query.status
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
      }
    }
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim()
      const terms: Record<string, unknown>[] = config.search.map((field) => ({
        [field]: { contains: keyword, mode: 'insensitive' },
      }))
      if (resource === 'skus')
        terms.push({ product: { name: { contains: keyword, mode: 'insensitive' } } })
      where.OR = terms
    }
    if (query.categoryId && resource === 'products') where.categoryId = query.categoryId
    if (query.hasImage !== undefined && resource === 'products') {
      where.images = query.hasImage ? { some: {} } : { none: {} }
    }
    if (query.categoryId && resource === 'skus') where.product = { categoryId: query.categoryId }
    if (query.productId && resource === 'skus') where.productId = query.productId
    if (query.purchaseChannelId && resource === 'suppliers')
      where.purchaseChannelId = query.purchaseChannelId
    if (query.salesChannelId && resource === 'customers')
      where.defaultSalesChannelId = query.salesChannelId
    return where
  }

  private async ensureActive(
    resource: 'category' | 'product' | 'unit' | 'purchaseChannel' | 'salesChannel',
    id: string,
  ) {
    const row = await (this.prisma as unknown as Record<string, Delegate>)[resource].findUnique({
      where: { id },
    })
    if (!row || row.status !== MasterDataStatus.ACTIVE) {
      throw new UnprocessableEntityException({
        code: 'REFERENCE_INACTIVE',
        message: '所选关联资料不存在或已停用',
      })
    }
  }

  private async createData(
    resource: MasterResource,
    payload: MasterDataPayloadDto,
  ): Promise<Record<string, unknown>> {
    const code = required(payload.code, '代码').trim()
    const name = required(payload.name, '名称').trim()
    return this.resourceData(resource, payload, { code, name }, true)
  }

  private async updateData(
    resource: MasterResource,
    payload: MasterDataPayloadDto,
  ): Promise<Record<string, unknown>> {
    const common = {
      ...(payload.code !== undefined ? { code: required(payload.code.trim(), '代码') } : {}),
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
    }
    return this.resourceData(resource, payload, common, false)
  }

  private async resourceData(
    resource: MasterResource,
    payload: MasterDataPayloadDto,
    common: Record<string, unknown>,
    creating: boolean,
  ): Promise<Record<string, unknown>> {
    switch (resource) {
      case 'categories':
        return common
      case 'products': {
        const categoryId = creating ? required(payload.categoryId, '类目') : payload.categoryId
        if (categoryId) await this.ensureActive('category', categoryId)
        return {
          ...common,
          ...(categoryId ? { categoryId } : {}),
          ...(payload.brand !== undefined || creating
            ? { brand: payload.brand?.trim() || '无品牌' }
            : {}),
          ...(payload.description !== undefined
            ? { description: payload.description || null }
            : {}),
        }
      }
      case 'units':
        return {
          ...common,
          ...(payload.decimalScale !== undefined
            ? { decimalScale: payload.decimalScale }
            : creating
              ? { decimalScale: 0 }
              : {}),
        }
      case 'skus': {
        const productId = creating ? required(payload.productId, 'Product') : payload.productId
        const baseUnitId = creating ? required(payload.baseUnitId, '基础单位') : payload.baseUnitId
        if (productId) await this.ensureActive('product', productId)
        if (baseUnitId) await this.ensureActive('unit', baseUnitId)
        return {
          ...common,
          ...(payload.barcode?.trim() ? { barcode: payload.barcode.trim() } : {}),
          ...(productId ? { productId } : {}),
          ...(baseUnitId ? { baseUnitId } : {}),
          ...(payload.attributes !== undefined
            ? { attributes: payload.attributes }
            : creating
              ? { attributes: {} }
              : {}),
          ...(payload.weight !== undefined ? { weight: payload.weight || null } : {}),
        }
      }
      case 'purchase-channels':
        return {
          ...common,
          ...(payload.type !== undefined
            ? { type: payload.type }
            : creating
              ? { type: required(payload.type, '类型') }
              : {}),
        }
      case 'suppliers': {
        if (payload.purchaseChannelId)
          await this.ensureActive('purchaseChannel', payload.purchaseChannelId)
        return {
          ...common,
          ...(payload.contactName !== undefined
            ? { contactName: payload.contactName || null }
            : {}),
          ...(payload.phone !== undefined ? { phone: payload.phone || null } : {}),
          ...(payload.taxNo !== undefined ? { taxNo: payload.taxNo || null } : {}),
          ...(payload.purchaseChannelId !== undefined
            ? { purchaseChannelId: payload.purchaseChannelId || null }
            : {}),
        }
      }
      case 'buyers':
        return {
          ...common,
          ...(payload.phone !== undefined ? { phone: payload.phone || null } : {}),
        }
      case 'sales-channels':
        return {
          ...common,
          ...(payload.inventoryMode !== undefined
            ? { inventoryMode: payload.inventoryMode }
            : creating
              ? { inventoryMode: required(payload.inventoryMode, '库存模式') }
              : {}),
        }
      case 'customers': {
        if (payload.defaultSalesChannelId)
          await this.ensureActive('salesChannel', payload.defaultSalesChannelId)
        return {
          ...common,
          ...(payload.phone !== undefined ? { phone: payload.phone || null } : {}),
          ...(payload.defaultSalesChannelId !== undefined
            ? { defaultSalesChannelId: payload.defaultSalesChannelId || null }
            : {}),
        }
      }
    }
  }

  private rethrowPrisma(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({ code: 'UNIQUE_CONFLICT', message: '代码或条码已存在' })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '记录不存在' })
    }
    throw error
  }
}
