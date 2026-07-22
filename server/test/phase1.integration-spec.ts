import { MasterDataStatus, PrismaClient } from '@prisma/client';
import { SortOrder } from '../src/common/dto/list-query.dto';
import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { MasterDataService } from '../src/modules/master-data/master-data.service';
import { cleanDatabase } from './database-cleanup';

describe('Phase 1 master data integration', () => {
  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const service = new MasterDataService(prisma, audit);
  let actor: { id: string; username: string };

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDatabase(prisma as PrismaClient);
    const user = await prisma.adminUser.create({
      data: { username: 'integration', passwordHash: 'not-used' },
    });
    actor = { id: user.id, username: user.username };
  });

  afterAll(async () => {
    await cleanDatabase(prisma as PrismaClient);
    await prisma.$disconnect();
  });

  it('creates Category → Product → SKU and finds SKU through server-side search', async () => {
    const category = await service.create('categories', { code: 'AUDIO', name: '音频设备' }, actor);
    const unit = await service.create('units', { code: 'PCS', name: '件', decimalScale: 0 }, actor);
    const product = await service.create(
      'products',
      { code: 'HEADSET', name: '无线耳机', categoryId: category.id as string },
      actor,
    );
    await service.create(
      'skus',
      {
        code: 'SKU-1001',
        name: '无线耳机 Pro',
        barcode: '6971234567890',
        productId: product.id as string,
        baseUnitId: unit.id as string,
        attributes: { color: '黑色' },
      },
      actor,
    );

    const result = await service.list('skus', {
      page: 1,
      pageSize: 20,
      keyword: '耳机',
      status: MasterDataStatus.ACTIVE,
      sortBy: 'createdAt',
      sortOrder: SortOrder.DESC,
    });
    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toMatchObject({ code: 'SKU-1001', barcode: '6971234567890' });
  });
});
