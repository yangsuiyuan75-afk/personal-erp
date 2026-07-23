import { describe, expect, it } from 'vitest';
import type { MasterRow } from '@/features/master-data/api';
import { sumPurchaseQuantity } from './purchase-page';

describe('sumPurchaseQuantity', () => {
  it('sums item quantities and ignores invalid values', () => {
    expect(
      sumPurchaseQuantity({
        id: 'order-1',
        code: 'PO-001',
        name: '采购订单',
        status: 'DRAFT',
        items: [{ quantity: '2.5' }, { quantity: 3 }, { quantity: 'invalid' }],
      } as MasterRow),
    ).toBe(5.5);
  });
});
