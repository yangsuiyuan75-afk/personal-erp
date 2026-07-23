import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disconnectOneDrive, getOneDriveStatus, startOneDriveConnection } from './api';

const oneDriveKey = ['onedrive', 'status'] as const;

export function useOneDriveStatus() {
  return useQuery({
    queryKey: oneDriveKey,
    queryFn: getOneDriveStatus,
    refetchInterval: (query) => (query.state.data?.code === 'AUTHORIZING' ? 2_000 : 30_000),
  });
}

export function useOneDriveMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: oneDriveKey });
  return {
    connect: useMutation({ mutationFn: startOneDriveConnection, onSuccess: refresh }),
    disconnect: useMutation({ mutationFn: disconnectOneDrive, onSuccess: refresh }),
  };
}
