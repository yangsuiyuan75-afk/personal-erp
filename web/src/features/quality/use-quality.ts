import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListParams } from '@/features/master-data/api';
import {
  confirmInspection,
  createInspection,
  getQualityAnalytics,
  listQuality,
  settleClaim,
  type QualityView,
} from './api';

const qualityKeys = {
  all: ['quality'] as const,
  list: (view: QualityView, params: ListParams) => ['quality', view, params] as const,
};

export function useQualityList(view: Exclude<QualityView, 'analytics'>, params: ListParams) {
  return useQuery({
    queryKey: qualityKeys.list(view, params),
    queryFn: () => listQuality(view, params),
  });
}

export function useQualityOptions(view: 'pending' | 'claims') {
  const params: ListParams = {
    page: 1,
    pageSize: 100,
    sortBy: view === 'pending' ? 'occurredAt' : 'submittedAt',
    sortOrder: 'desc',
  };
  return useQuery({
    queryKey: qualityKeys.list(view, params),
    queryFn: () => listQuality(view, params),
    staleTime: 10_000,
  });
}

export function useQualityAnalytics(params: ListParams, enabled: boolean) {
  return useQuery({
    queryKey: qualityKeys.list('analytics', params),
    queryFn: () => getQualityAnalytics(params),
    enabled,
  });
}

export function useQualityMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: qualityKeys.all });
  return {
    inspection: useMutation({ mutationFn: createInspection, onSuccess: refresh }),
    confirm: useMutation({
      mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
        confirmInspection(id, payload),
      onSuccess: refresh,
    }),
    settlement: useMutation({
      mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
        settleClaim(id, payload),
      onSuccess: refresh,
    }),
  };
}
