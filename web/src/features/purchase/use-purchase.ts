import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListParams } from '@/features/master-data/api';
import {
  createPurchaseOrder,
  createPurchasePrice,
  createPurchaseReceipt,
  createPurchaseReturn,
  listPurchase,
  transitionPurchase,
  updatePurchaseOrder,
  type PurchaseView,
} from './api';

const purchaseKeys = {
  all: ['purchase'] as const,
  list: (view: PurchaseView, params: ListParams) => ['purchase', view, params] as const,
};

export function usePurchaseList(view: PurchaseView, params: ListParams) {
  return useQuery({
    queryKey: purchaseKeys.list(view, params),
    queryFn: () => listPurchase(view, params),
  });
}

export function usePurchaseOptions(view: 'orders' | 'receipts') {
  const params: ListParams = {
    page: 1,
    pageSize: 100,
    sortBy: view === 'orders' ? 'orderDate' : 'occurredAt',
    sortOrder: 'desc',
  };
  return useQuery({
    queryKey: purchaseKeys.list(view, params),
    queryFn: () => listPurchase(view, params),
    staleTime: 10_000,
  });
}

export function usePurchaseMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: purchaseKeys.all });
  return {
    price: useMutation({ mutationFn: createPurchasePrice, onSuccess: refresh }),
    order: useMutation({ mutationFn: createPurchaseOrder, onSuccess: refresh }),
    orderUpdate: useMutation({
      mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
        updatePurchaseOrder(id, payload),
      onSuccess: refresh,
    }),
    receipt: useMutation({ mutationFn: createPurchaseReceipt, onSuccess: refresh }),
    returned: useMutation({ mutationFn: createPurchaseReturn, onSuccess: refresh }),
    transition: useMutation({
      mutationFn: (input: {
        kind: 'orders' | 'receipts' | 'returns';
        id: string;
        action: 'confirm' | 'cancel' | 'post';
      }) => transitionPurchase(input.kind, input.id, input.action),
      onSuccess: refresh,
    }),
  };
}
