import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/app/layout/app-layout';
import { AuditPage } from '@/features/audit/audit-page';
import { MasterDataPage } from '@/features/master-data/master-data-page';
import { WorkbenchPage } from '@/features/workbench/workbench-page';
import { InventoryPage } from '@/features/inventory/inventory-page';
import { FinancePage } from '@/features/finance/finance-page';
import { FilesPage } from '@/features/files/files-page';
import { BackupPage } from '@/features/backup/backup-page';
import { PurchasePage } from '@/features/purchase/purchase-page';
import { QualityPage } from '@/features/quality/quality-page';
import { SalesPage } from '@/features/sales/sales-page';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route element={<Navigate replace to="/workbench" />} index />
        <Route element={<WorkbenchPage />} path="workbench" />
        <Route element={<MasterDataPage />} path="master/:resource" />
        <Route element={<AuditPage />} path="audit" />
        <Route element={<InventoryPage />} path="inventory" />
        <Route element={<PurchasePage />} path="purchase" />
        <Route element={<SalesPage />} path="sales" />
        <Route element={<QualityPage />} path="quality" />
        <Route element={<FinancePage />} path="finance" />
        <Route element={<FilesPage />} path="files" />
        <Route element={<BackupPage />} path="backups" />
        <Route element={<Navigate replace to="/workbench" />} path="*" />
      </Route>
    </Routes>
  );
}
