export const MASTER_RESOURCES = {
  categories: {
    delegate: 'category',
    search: ['code', 'name'],
    sort: ['code', 'name', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'status', 'createdAt'],
  },
  products: {
    delegate: 'product',
    search: ['code', 'name', 'brand'],
    sort: ['code', 'name', 'brand', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'brand', 'status', 'createdAt'],
  },
  units: {
    delegate: 'unit',
    search: ['code', 'name'],
    sort: ['code', 'name', 'decimalScale', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'decimalScale', 'status'],
  },
  skus: {
    delegate: 'sku',
    search: ['code', 'name'],
    sort: ['code', 'name', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'status', 'createdAt'],
  },
  'purchase-channels': {
    delegate: 'purchaseChannel',
    search: ['code', 'name', 'type'],
    sort: ['code', 'name', 'type', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'type', 'status'],
  },
  suppliers: {
    delegate: 'supplier',
    search: ['code', 'name', 'contactName', 'phone'],
    sort: ['code', 'name', 'contactName', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'contactName', 'phone', 'taxNo', 'status'],
  },
  buyers: {
    delegate: 'buyer',
    search: ['code', 'name', 'phone'],
    sort: ['code', 'name', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'phone', 'status'],
  },
  'sales-channels': {
    delegate: 'salesChannel',
    search: ['code', 'name'],
    sort: ['code', 'name', 'inventoryMode', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'inventoryMode', 'status'],
  },
  customers: {
    delegate: 'customer',
    search: ['code', 'name', 'phone'],
    sort: ['code', 'name', 'status', 'createdAt', 'updatedAt'],
    csv: ['code', 'name', 'phone', 'status'],
  },
} as const

export type MasterResource = keyof typeof MASTER_RESOURCES
