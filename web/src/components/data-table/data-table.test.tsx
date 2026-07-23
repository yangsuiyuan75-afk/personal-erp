import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';

describe('DataTable default detail', () => {
  it('groups nested audit data and uses readable labels', () => {
    render(
      <DataTable
        columns={[
          { key: 'module', label: '模块', sortable: false },
          { key: 'action', label: '操作', sortable: false },
          { key: 'type', label: '类型', sortable: false },
        ]}
        detailHiddenKeys={['code', 'name', 'status']}
        loading={false}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onSort={() => undefined}
        rows={[
          {
            id: 'audit-1',
            code: 'CREATE_STARTUP_COMPENSATION',
            name: 'BackupHistory',
            status: 'ACTIVE',
            userId: 'd11630be-7e9a-4983-b2a1-32e92e745393',
            module: 'BACKUP',
            action: 'CREATE_STARTUP_COMPENSATION',
            entityType: 'BackupHistory',
            type: 'PHYSICAL_WAREHOUSE',
            after: { backupNo: 'BKP-001', sha256: 'a'.repeat(64) },
          },
        ]}
        sortBy="createdAt"
        sortOrder="desc"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看 BackupHistory' }));

    expect(screen.getAllByText('模块')).toHaveLength(3);
    expect(screen.getAllByText('备份恢复')).toHaveLength(2);
    expect(screen.getAllByText('创建启动补偿')).toHaveLength(2);
    expect(screen.getAllByText('物理仓库')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '变更后' })).toBeInTheDocument();
    expect(screen.getByText('备份编号')).toBeInTheDocument();
    expect(screen.queryByText('after', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('d11630be-7e9a-4983-b2a1-32e92e745393')).not.toBeInTheDocument();
  });

  it('keeps business fields and removes internal identifiers from document details', () => {
    render(
      <DataTable
        columns={[
          { key: 'receiptNo', label: '收货编号' },
          { key: 'purchaseOrder.orderNo', label: '采购订单' },
          { key: 'purchaseOrder.supplier.name', label: '供应商' },
          { key: 'location.name', label: '入库地点' },
          { key: 'items', label: '收货明细', sortable: false },
          { key: 'totalAmount', label: '收货金额' },
          { key: 'status', label: '状态' },
          { key: 'occurredAt', label: '收货日期' },
        ]}
        loading={false}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onSort={() => undefined}
        rows={[
          {
            id: '52aaaad8-ead4-4124-8847-eb719f3a28b6',
            code: 'PR-001',
            name: '中泰博科技',
            receiptNo: 'PR-001',
            purchaseOrderId: 'e9e7259e-c2c7-4427-8dfa-dca064a144b6',
            transactionId: '1cc1661c-39c9-4413-aad1-f4bd80af049d',
            status: 'POSTED',
            occurredAt: '2026-07-21T00:00:00.000Z',
            totalAmount: '360',
            purchaseOrder: {
              id: 'e9e7259e-c2c7-4427-8dfa-dca064a144b6',
              orderNo: 'PO-001',
              supplierId: '927ced3b-e944-4b04-bdee-27b8d1b20453',
              supplier: {
                id: '927ced3b-e944-4b04-bdee-27b8d1b20453',
                code: 'AA01',
                name: '中泰博科技',
              },
            },
            location: {
              id: '4ff0d687-93bf-44b2-a3ed-e0190abd86b1',
              code: 'LongSheng',
              name: '档口仓库',
            },
            items: [
              {
                id: '520d34f0-3824-4585-8a7a-2a8ac10b0baa',
                skuId: 'f8abcf8f-0e2d-4803-b253-52501a979193',
                quantity: '20',
                unitPrice: '18',
                lineAmount: '360',
                sku: { code: 'Car-Charger-C1', name: '120W车载快充' },
              },
            ],
          },
        ]}
        sortBy="occurredAt"
        sortOrder="desc"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看 中泰博科技' }));

    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('PR-001 · 中泰博科技')).toBeInTheDocument();
    expect(dialog.getByText('收货编号')).toBeInTheDocument();
    expect(dialog.getByRole('heading', { name: '采购订单' })).toBeInTheDocument();
    expect(dialog.getByText('AA01 · 中泰博科技')).toBeInTheDocument();
    expect(dialog.getByText('LongSheng · 档口仓库')).toBeInTheDocument();
    expect(dialog.getAllByText('¥360.00')).toHaveLength(2);
    expect(dialog.getByText('2026年7月21日')).toBeInTheDocument();
    expect(dialog.queryByText('purchaseOrderId')).not.toBeInTheDocument();
    expect(dialog.queryByText('e9e7259e-c2c7-4427-8dfa-dca064a144b6')).not.toBeInTheDocument();
  });
});
