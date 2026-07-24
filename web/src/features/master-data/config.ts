import { z } from 'zod'

export interface FieldOption {
  value: string
  label: string
}

export interface FormField {
  name: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'json' | 'attributes'
  required?: boolean
  options?: FieldOption[]
  optionResource?: string
  placeholder?: string
}

export interface ColumnDef {
  key: string
  label: string
}

export interface MasterConfig {
  resource: string
  title: string
  description: string
  schema: z.ZodTypeAny
  fields: FormField[]
  columns: ColumnDef[]
}

const code = z.string().trim().min(1, '请输入代码').max(64)
const name = z.string().trim().min(1, '请输入名称').max(200)
const optionalText = z.string().max(2000).optional()
const common = { code, name }
const statusColumn = { key: 'status', label: '状态' }

export const masterConfigs: Record<string, MasterConfig> = {
  categories: {
    resource: 'categories',
    title: '商品类目',
    description: '维护单层商品分类；被商品引用后请停用而不是删除。',
    schema: z.object(common),
    fields: [
      { name: 'code', label: '类目代码', required: true },
      { name: 'name', label: '类目名称', required: true },
    ],
    columns: [
      { key: 'code', label: '代码' },
      { key: 'name', label: '类目名称' },
      statusColumn,
      { key: 'updatedAt', label: '更新时间' },
    ],
  },
  products: {
    resource: 'products',
    title: '产品',
    description: '管理商品主体、品牌和说明；实际交易与库存使用 SKU。',
    schema: z.object({
      ...common,
      categoryId: z.string().uuid('请选择类目'),
      brand: optionalText,
      description: optionalText,
    }),
    fields: [
      { name: 'code', label: '产品代码', required: true },
      { name: 'name', label: '商品名称', required: true },
      {
        name: 'categoryId',
        label: '商品类目',
        type: 'select',
        required: true,
        optionResource: 'categories',
      },
      { name: 'brand', label: '品牌' },
      { name: 'description', label: '商品说明', type: 'textarea' },
    ],
    columns: [
      { key: 'code', label: '代码' },
      { key: 'name', label: '商品名称' },
      { key: 'category.name', label: '类目' },
      { key: 'brand', label: '品牌' },
      statusColumn,
    ],
  },
  skus: {
    resource: 'skus',
    title: 'SKU',
    description: 'SKU 仅表示可交易商品身份，不保存售价、采购价或成本。',
    schema: z.object({
      ...common,
      productId: z.string().uuid('请选择产品'),
      baseUnitId: z.string().uuid('请选择基础单位'),
      weight: z
        .string()
        .regex(/^\d+(\.\d{1,4})?$/, '重量最多 4 位小数')
        .optional()
        .or(z.literal('')),
      attributes: z
        .string()
        .default('{}')
        .refine((value) => {
          try {
            return typeof JSON.parse(value) === 'object'
          } catch {
            return false
          }
        }, '属性必须是合法 JSON'),
    }),
    fields: [
      { name: 'code', label: 'SKU 代码', required: true },
      { name: 'name', label: 'SKU 名称', required: true },
      {
        name: 'productId',
        label: '产品',
        type: 'select',
        required: true,
        optionResource: 'products',
      },
      {
        name: 'baseUnitId',
        label: '基础单位',
        type: 'select',
        required: true,
        optionResource: 'units',
      },
      { name: 'weight', label: '重量（g）', placeholder: '可选，最多 4 位小数' },
      { name: 'attributes', label: '属性', type: 'attributes' },
    ],
    columns: [
      { key: 'code', label: 'SKU' },
      { key: 'name', label: 'SKU 名称' },
      { key: 'product.name', label: '产品' },
      { key: 'baseUnit.name', label: '单位' },
      statusColumn,
    ],
  },
  units: {
    resource: 'units',
    title: '基础单位',
    description: '定义数量精度；已被 SKU 引用的单位只能停用。',
    schema: z.object({ ...common, decimalScale: z.coerce.number().int().min(0).max(4) }),
    fields: [
      { name: 'code', label: '单位代码', required: true },
      { name: 'name', label: '单位名称', required: true },
      { name: 'decimalScale', label: '数量小数位', type: 'number', required: true },
    ],
    columns: [
      { key: 'code', label: '代码' },
      { key: 'name', label: '单位名称' },
      { key: 'decimalScale', label: '小数位' },
      statusColumn,
    ],
  },
  'purchase-channels': {
    resource: 'purchase-channels',
    title: '采购渠道',
    description: '记录寻找或交易来源，例如 1688、淘宝、工厂直采。',
    schema: z.object({ ...common, type: z.string().min(1, '请输入渠道类型') }),
    fields: [
      { name: 'code', label: '渠道代码', required: true },
      { name: 'name', label: '渠道名称', required: true },
      { name: 'type', label: '渠道类型', required: true },
    ],
    columns: [
      { key: 'code', label: '代码' },
      { key: 'name', label: '采购渠道' },
      { key: 'type', label: '类型' },
      statusColumn,
    ],
  },
  suppliers: {
    resource: 'suppliers',
    title: '供应商',
    description: '供应商是实际供货方，与采购渠道分开管理。',
    schema: z.object({
      ...common,
      contactName: optionalText,
      phone: optionalText,
      taxNo: optionalText,
      purchaseChannelId: z.string().optional(),
    }),
    fields: [
      { name: 'code', label: '供应商代码', required: true },
      { name: 'name', label: '供应商名称', required: true },
      { name: 'contactName', label: '联系人' },
      { name: 'phone', label: '联系电话' },
      { name: 'taxNo', label: '税号' },
      {
        name: 'purchaseChannelId',
        label: '默认采购渠道',
        type: 'select',
        optionResource: 'purchase-channels',
      },
    ],
    columns: [
      { key: 'code', label: '代码' },
      { key: 'name', label: '供应商' },
      { key: 'contactName', label: '联系人' },
      { key: 'purchaseChannel.name', label: '采购渠道' },
      statusColumn,
    ],
  },
  buyers: {
    resource: 'buyers',
    title: '采购员',
    description: '采购员是业务负责人，不是登录用户。',
    schema: z.object({
      ...common,
      phone: optionalText,
    }),
    fields: [
      { name: 'code', label: '采购员代码', required: true },
      { name: 'name', label: '姓名', required: true },
      { name: 'phone', label: '联系电话' },
    ],
    columns: [
      { key: 'code', label: '代码' },
      { key: 'name', label: '采购员' },
      { key: 'phone', label: '联系电话' },
      statusColumn,
    ],
  },
  'sales-channels': {
    resource: 'sales-channels',
    title: '销售渠道',
    description: '销售渠道表示销售来源；平台外部仓与虚拟额度采用不同库存模式。',
    schema: z.object({ ...common, inventoryMode: z.string().min(1, '请选择库存模式') }),
    fields: [
      { name: 'code', label: '渠道代码', required: true },
      { name: 'name', label: '渠道名称', required: true },
      {
        name: 'inventoryMode',
        label: '库存模式',
        type: 'select',
        required: true,
        options: [
          { value: 'DIRECT_FROM_LOCATION', label: '指定仓库直发' },
          { value: 'EXTERNAL_WAREHOUSE', label: '外部平台仓' },
          { value: 'VIRTUAL_ALLOCATION', label: '虚拟渠道额度' },
        ],
      },
    ],
    columns: [
      { key: 'code', label: '代码' },
      { key: 'name', label: '销售渠道' },
      { key: 'inventoryMode', label: '库存模式' },
      statusColumn,
    ],
  },
  customers: {
    resource: 'customers',
    title: '客户',
    description: '客户表示具体交易对手，不能替代销售渠道。',
    schema: z.object({
      ...common,
      phone: optionalText,
      defaultSalesChannelId: z.string().optional(),
    }),
    fields: [
      { name: 'code', label: '客户代码', required: true },
      { name: 'name', label: '客户名称', required: true },
      { name: 'phone', label: '联系电话' },
      {
        name: 'defaultSalesChannelId',
        label: '默认销售渠道',
        type: 'select',
        optionResource: 'sales-channels',
      },
    ],
    columns: [
      { key: 'code', label: '代码' },
      { key: 'name', label: '客户' },
      { key: 'phone', label: '联系电话' },
      { key: 'defaultSalesChannel.name', label: '默认渠道' },
      statusColumn,
    ],
  },
}
