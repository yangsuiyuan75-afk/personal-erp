import { apiClient } from '@/lib/axios/client';
import type {
  ListParams,
  MasterListResponse,
  MasterRow,
  PageMeta,
} from '@/features/master-data/api';

export interface BackupHistory extends MasterRow {
  backupNo: string;
  status: 'CREATING' | 'UPLOADING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  trigger:
    'MANUAL' | 'STARTUP_COMPENSATION' | 'OPERATION_THRESHOLD' | 'PRE_RESTORE' | 'BOOTSTRAP_IMPORT';
  format: 'POSTGRES_CUSTOM';
  schemaVersion: string;
  appVersion: string;
  postgresVersion?: string;
  sha256?: string;
  size: string;
  manifest?: {
    recordCounts?: Record<string, number>;
    catalogEntries?: number;
  };
  locked: boolean;
  localAvailable: boolean;
  startedAt: string;
  completedAt?: string;
  verifiedAt?: string;
  cloudUploadedAt?: string;
  restoredAt?: string;
  errorMessage?: string;
  fileAsset?: { provider: string; status: string; fileName: string };
}

export interface BackupSystemStatus {
  maintenance: { active: boolean; reason?: string; since?: string };
  task: { backupRunning: boolean; restoreRunning: boolean };
  latest: BackupHistory | null;
  changesSinceLast: number;
  operationsSinceLast: number;
  operationThreshold: number;
  backupRecommended: boolean;
  autoAfterHours: number;
  recoveryConfigured: boolean;
}

export interface BootstrapRecoveryStatus {
  schemaReady: boolean;
  initialized: boolean;
  recoveryRequired: boolean;
  recoveryConfigured: boolean;
  confirmPhrase: string;
}

function identity(row: BackupHistory): BackupHistory {
  return { ...row, code: row.backupNo, name: row.backupNo };
}

export async function listBackups(params: ListParams): Promise<MasterListResponse> {
  const response = await apiClient.get<{ data: BackupHistory[]; meta: PageMeta }>('/backups', {
    params,
  });
  return { ...response.data, data: response.data.data.map(identity) };
}

export async function getBackupStatus(): Promise<BackupSystemStatus> {
  const response = await apiClient.get<{ data: BackupSystemStatus }>('/backups/status');
  return response.data.data;
}

export async function createBackup(locked = false): Promise<BackupHistory> {
  const response = await apiClient.post<{ data: BackupHistory }>('/backups', { locked });
  return identity(response.data.data);
}

export async function verifyBackup(id: string): Promise<BackupHistory> {
  const response = await apiClient.post<{ data: BackupHistory }>(`/backups/${id}/verify`);
  return identity(response.data.data);
}

export async function setBackupLock(id: string, locked: boolean): Promise<BackupHistory> {
  const response = await apiClient.patch<{ data: BackupHistory }>(`/backups/${id}/lock`, {
    locked,
  });
  return identity(response.data.data);
}

export async function restoreBackup(input: {
  id: string;
  password: string;
  confirmPhrase: string;
}): Promise<{ restored: boolean; backupNo: string; preRestoreBackupNo: string }> {
  const response = await apiClient.post<{
    data: { restored: boolean; backupNo: string; preRestoreBackupNo: string };
  }>(`/backups/${input.id}/restore`, {
    password: input.password,
    confirmPhrase: input.confirmPhrase,
  });
  return response.data.data;
}

export async function downloadBackup(backup: BackupHistory): Promise<void> {
  const response = await apiClient.get<Blob>(`/backups/${backup.id}/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${backup.backupNo}.dump`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportBackups(params: ListParams): Promise<void> {
  const response = await apiClient.get('/backups/export', { params, responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'backup-history.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export async function getBootstrapRecoveryStatus(): Promise<BootstrapRecoveryStatus> {
  const response = await apiClient.get<{ data: BootstrapRecoveryStatus }>(
    '/bootstrap-recovery/status',
  );
  return response.data.data;
}

export async function bootstrapRestore(input: {
  file: File;
  recoveryKey: string;
  confirmPhrase: string;
}): Promise<{ restored: boolean; backupNo: string }> {
  const body = new FormData();
  body.set('file', input.file);
  body.set('confirmPhrase', input.confirmPhrase);
  const response = await apiClient.post<{ data: { restored: boolean; backupNo: string } }>(
    '/bootstrap-recovery/restore',
    body,
    { headers: { 'x-recovery-key': input.recoveryKey } },
  );
  return response.data.data;
}
