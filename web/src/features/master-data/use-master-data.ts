import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMasterData,
  deactivateMasterData,
  listMasterData,
  updateMasterData,
  type ListParams,
} from './api';
import { queryKeys } from './query-keys';

export function useMasterList(resource: string, params: ListParams) {
  return useQuery({
    queryKey: queryKeys.masterData.list(resource, params),
    queryFn: () => listMasterData(resource, params),
    placeholderData: keepPreviousData,
  });
}

export function useMasterOptions(resource?: string) {
  return useQuery({
    queryKey: queryKeys.masterData.options(resource ?? 'none'),
    queryFn: () =>
      listMasterData(resource!, {
        page: 1,
        pageSize: 100,
        status: 'ACTIVE',
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    enabled: Boolean(resource),
    staleTime: 60_000,
  });
}

export function useMasterMutations(resource: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ['master-data', resource] });
  return {
    create: useMutation({
      mutationFn: (payload: Record<string, unknown>) => createMasterData(resource, payload),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
        updateMasterData(resource, id, payload),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (id: string) => deactivateMasterData(resource, id),
      onSuccess: invalidate,
    }),
  };
}
