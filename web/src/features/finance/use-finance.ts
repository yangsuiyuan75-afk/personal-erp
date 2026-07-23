import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListParams } from '@/features/master-data/api';
import {
  createAdjustment,
  createExpenseBill,
  createFinancialAccount,
  createPayment,
  createReceipt,
  getFinanceAnalytics,
  listFinance,
  listFinanceOptions,
  listExpenseBills,
  postFinanceDocument,
  type FinanceListView,
  type FinanceOptionSource,
} from './api';

const financeKeys = {
  all: ['finance'] as const,
  list: (view: string, params?: ListParams) => ['finance', view, params] as const,
  options: (source: FinanceOptionSource) => ['finance', 'options', source] as const,
};

export function useFinanceList(view: FinanceListView, params: ListParams) {
  return useQuery({
    queryKey: financeKeys.list(view, params),
    queryFn: () => listFinance(view, params),
  });
}

export function useFinanceOptions(source: FinanceOptionSource) {
  return useQuery({
    queryKey: financeKeys.options(source),
    queryFn: () => listFinanceOptions(source),
    staleTime: 10_000,
  });
}

export function useFinanceAnalytics(params: ListParams) {
  return useQuery({
    queryKey: financeKeys.list('analytics', params),
    queryFn: () => getFinanceAnalytics(params),
  });
}

export function useExpenseBills(params: ListParams) {
  return useQuery({
    queryKey: financeKeys.list('expenses', params),
    queryFn: () => listExpenseBills(params),
  });
}

export function useFinanceMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries();
  return {
    account: useMutation({ mutationFn: createFinancialAccount, onSuccess: refresh }),
    payment: useMutation({ mutationFn: createPayment, onSuccess: refresh }),
    receipt: useMutation({ mutationFn: createReceipt, onSuccess: refresh }),
    adjustment: useMutation({ mutationFn: createAdjustment, onSuccess: refresh }),
    expense: useMutation({ mutationFn: createExpenseBill, onSuccess: refresh }),
    post: useMutation({
      mutationFn: ({
        kind,
        id,
      }: {
        kind: 'payments' | 'receipts' | 'adjustments' | 'expenses';
        id: string;
      }) => postFinanceDocument(kind, id),
      onSuccess: refresh,
    }),
  };
}
