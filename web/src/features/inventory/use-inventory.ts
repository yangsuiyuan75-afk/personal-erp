import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListParams } from '@/features/master-data/api'
import {
  createAdjustment,
  createLocation,
  createOpening,
  createTransfer,
  listBalances,
  listBatches,
  listLocations,
  listTransactions,
  postInventoryDocument,
  previewOpeningFile,
} from './api'

export const inventoryKeys = {
  all: ['inventory'] as const,
  balances: (params: ListParams) => ['inventory', 'balances', params] as const,
  locations: (params: ListParams) => ['inventory', 'locations', params] as const,
  transactions: (params: ListParams) => ['inventory', 'transactions', params] as const,
  batches: (params: ListParams) => ['inventory', 'batches', params] as const,
}

export function useInventoryList(
  view: 'balances' | 'locations' | 'transactions' | 'batches',
  params: ListParams,
) {
  const functions = {
    balances: listBalances,
    locations: listLocations,
    transactions: listTransactions,
    batches: listBatches,
  }
  return useQuery({
    queryKey: inventoryKeys[view](params),
    queryFn: () => functions[view](params),
  })
}

export function useSkuInventory(skuId?: string) {
  const params: ListParams = {
    page: 1,
    pageSize: 100,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    skuId,
  }
  const batches: ListParams = {
    page: 1,
    pageSize: 20,
    sortBy: 'receivedAt',
    sortOrder: 'asc',
    skuId,
  }
  return {
    balances: useQuery({
      queryKey: inventoryKeys.balances(params),
      queryFn: () => listBalances(params),
      enabled: Boolean(skuId),
    }),
    batches: useQuery({
      queryKey: inventoryKeys.batches(batches),
      queryFn: () => listBatches(batches),
      enabled: Boolean(skuId),
    }),
  }
}

export function useInventoryMutations() {
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: inventoryKeys.all })
  return {
    createLocation: useMutation({ mutationFn: createLocation, onSuccess: refresh }),
    previewOpening: useMutation({ mutationFn: previewOpeningFile }),
    createOpening: useMutation({ mutationFn: createOpening }),
    createAdjustment: useMutation({ mutationFn: createAdjustment }),
    createTransfer: useMutation({ mutationFn: createTransfer }),
    post: useMutation({
      mutationFn: ({ kind, id }: { kind: 'openings' | 'adjustments' | 'transfers'; id: string }) =>
        postInventoryDocument(kind, id),
      onSuccess: refresh,
    }),
  }
}
