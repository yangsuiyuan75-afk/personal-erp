import { describe, expect, it } from 'vitest'
import type { MasterRow } from '@/features/master-data/api'
import { sumSalesQuantity } from './sales-page'

describe('sumSalesQuantity', () => {
  it('sums item quantities and ignores invalid values', () => {
    expect(
      sumSalesQuantity({
        id: 'order-1',
        code: 'SO-001',
        name: '销售订单',
        status: 'DRAFT',
        items: [{ quantity: '2.5' }, { quantity: 3 }, { quantity: 'invalid' }],
      } as MasterRow),
    ).toBe(5.5)
  })
})
