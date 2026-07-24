import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  createMasterData,
  deactivateMasterData,
  deleteProductImage,
  getProductImageBlob,
  getProductImages,
  listMasterData,
  updateMasterData,
  uploadProductImages,
  type ListParams,
} from './api'
import { queryKeys } from './query-keys'

export function useMasterList(resource: string, params: ListParams) {
  return useQuery({
    queryKey: queryKeys.masterData.list(resource, params),
    queryFn: () => listMasterData(resource, params),
    placeholderData: keepPreviousData,
  })
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
  })
}

export function useMasterMutations(resource: string) {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: ['master-data', resource] })
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
  }
}

const productImageKey = (productId?: string) => ['product-images', productId] as const

export function useProductImages(productId?: string) {
  return useQuery({
    queryKey: productImageKey(productId),
    queryFn: () => getProductImages(productId!),
    enabled: Boolean(productId),
  })
}

export function useProductImageUrl(productId?: string, fileAssetId?: string) {
  const query = useQuery({
    queryKey: [...productImageKey(productId), fileAssetId],
    queryFn: () => getProductImageBlob(productId!, fileAssetId!),
    enabled: Boolean(productId && fileAssetId),
    staleTime: 5 * 60_000,
  })
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!query.data) {
      setUrl(undefined)
      return
    }
    const next = URL.createObjectURL(query.data)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [query.data])
  return { ...query, url }
}

export function useProductImageMutations() {
  const client = useQueryClient()
  const refresh = (productId: string) => {
    client.invalidateQueries({ queryKey: productImageKey(productId) })
    client.invalidateQueries({ queryKey: ['master-data', 'products'] })
  }
  return {
    upload: useMutation({
      mutationFn: ({ productId, files }: { productId: string; files: File[] }) =>
        uploadProductImages(productId, files),
      onSuccess: (_, { productId }) => refresh(productId),
    }),
    remove: useMutation({
      mutationFn: ({ productId, imageId }: { productId: string; imageId: string }) =>
        deleteProductImage(productId, imageId),
      onSuccess: (_, { productId }) => refresh(productId),
    }),
  }
}
