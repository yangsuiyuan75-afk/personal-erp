import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListParams } from '@/features/master-data/api';
import {
  createSalesOrder,
  createSalesPrice,
  createSalesReturn,
  listSales,
  transitionSales,
  type SalesView,
  updateSalesIssue,
} from './api';

const salesKeys = {
  all: ['sales'] as const,
  list: (view: SalesView, params: ListParams) => ['sales', view, params] as const,
};

export function useSalesList(view: SalesView, params: ListParams) {
  return useQuery({
    queryKey: salesKeys.list(view, params),
    queryFn: () => listSales(view, params),
  });
}

export function useSalesOptions(view: 'orders' | 'issues') {
  const params: ListParams = {
    page: 1,
    pageSize: 100,
    sortBy: view === 'orders' ? 'orderDate' : 'occurredAt',
    sortOrder: 'desc',
  };
  return useQuery({
    queryKey: salesKeys.list(view, params),
    queryFn: () => listSales(view, params),
    staleTime: 10_000,
  });
}

export function useSalesMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: salesKeys.all });
  return {
    price: useMutation({ mutationFn: createSalesPrice, onSuccess: refresh }),
    order: useMutation({ mutationFn: createSalesOrder, onSuccess: refresh }),
    issue: useMutation({
      mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
        updateSalesIssue(id, payload),
      onSuccess: refresh,
    }),
    returned: useMutation({ mutationFn: createSalesReturn, onSuccess: refresh }),
    transition: useMutation({
      mutationFn: (input: {
        kind: 'orders' | 'issues' | 'returns';
        id: string;
        action: 'confirm' | 'cancel' | 'post';
      }) => transitionSales(input.kind, input.id, input.action),
      onSuccess: refresh,
    }),
  };
}
