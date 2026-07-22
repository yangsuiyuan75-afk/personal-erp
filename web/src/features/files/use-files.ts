import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ListParams } from '@/features/master-data/api';
import {
  deleteFile,
  deleteProductImage,
  disconnectOneDrive,
  getFileBlob,
  getOneDriveStatus,
  getProductImages,
  listFiles,
  reorderProductImages,
  retryFile,
  setPrimaryImage,
  startOneDriveConnection,
  uploadFile,
  uploadProductImages,
} from './api';

const keys = {
  all: ['files'] as const,
  list: (params: ListParams) => ['files', 'list', params] as const,
  product: (id?: string) => ['files', 'product-images', id] as const,
  content: (id?: string) => ['files', 'content', id] as const,
  oneDrive: ['files', 'onedrive-status'] as const,
};

export function useFilesList(params: ListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => listFiles(params),
    placeholderData: keepPreviousData,
  });
}

export function useProductImages(productId?: string) {
  return useQuery({
    queryKey: keys.product(productId),
    queryFn: () => getProductImages(productId!),
    enabled: Boolean(productId),
  });
}

export function useOneDriveStatus() {
  return useQuery({
    queryKey: keys.oneDrive,
    queryFn: getOneDriveStatus,
    refetchInterval: (query) => (query.state.data?.code === 'AUTHORIZING' ? 2_000 : 30_000),
  });
}

export function useFileObjectUrl(fileAssetId?: string) {
  const query = useQuery({
    queryKey: keys.content(fileAssetId),
    queryFn: () => getFileBlob(fileAssetId!),
    enabled: Boolean(fileAssetId),
    staleTime: 5 * 60_000,
  });
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!query.data) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(query.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [query.data]);
  return { ...query, url };
}

export function useFileMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: keys.all });
  return {
    upload: useMutation({ mutationFn: uploadFile, onSuccess: refresh }),
    remove: useMutation({ mutationFn: deleteFile, onSuccess: refresh }),
    retry: useMutation({ mutationFn: retryFile, onSuccess: refresh }),
    uploadImages: useMutation({ mutationFn: uploadProductImages, onSuccess: refresh }),
    primary: useMutation({
      mutationFn: ({ productId, imageId }: { productId: string; imageId: string }) =>
        setPrimaryImage(productId, imageId),
      onSuccess: refresh,
    }),
    reorder: useMutation({
      mutationFn: ({ productId, imageIds }: { productId: string; imageIds: string[] }) =>
        reorderProductImages(productId, imageIds),
      onSuccess: refresh,
    }),
    removeImage: useMutation({
      mutationFn: ({ productId, imageId }: { productId: string; imageId: string }) =>
        deleteProductImage(productId, imageId),
      onSuccess: refresh,
    }),
    connect: useMutation({
      mutationFn: startOneDriveConnection,
      onSuccess: () => client.invalidateQueries({ queryKey: keys.oneDrive }),
    }),
    disconnect: useMutation({
      mutationFn: disconnectOneDrive,
      onSuccess: refresh,
    }),
  };
}
