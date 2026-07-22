import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListParams } from '@/features/master-data/api';
import {
  createBackup,
  getBackupStatus,
  listBackups,
  restoreBackup,
  setBackupLock,
  verifyBackup,
} from './api';

const keys = {
  all: ['backups'] as const,
  list: (params: ListParams) => ['backups', 'list', params] as const,
  status: ['backups', 'status'] as const,
};

export function useBackupList(params: ListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => listBackups(params),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.data.some((row) => ['CREATING', 'UPLOADING'].includes(String(row.status)))
        ? 2_000
        : false,
  });
}

export function useBackupStatus() {
  return useQuery({ queryKey: keys.status, queryFn: getBackupStatus, refetchInterval: 15_000 });
}

export function useBackupMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: keys.all });
  return {
    create: useMutation({ mutationFn: createBackup, onSuccess: refresh }),
    verify: useMutation({ mutationFn: verifyBackup, onSuccess: refresh }),
    lock: useMutation({
      mutationFn: ({ id, locked }: { id: string; locked: boolean }) => setBackupLock(id, locked),
      onSuccess: refresh,
    }),
    restore: useMutation({ mutationFn: restoreBackup, onSuccess: refresh }),
  };
}
