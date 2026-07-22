import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bootstrapAdmin, getAuthStatus, login, logout, refreshSession } from './api';

export const authKeys = {
  status: ['auth', 'status'] as const,
  session: ['auth', 'session'] as const,
};

export function useAuthStatus() {
  return useQuery({ queryKey: authKeys.status, queryFn: getAuthStatus, retry: 1 });
}

export function useSession(enabled: boolean) {
  return useQuery({
    queryKey: authKeys.session,
    queryFn: refreshSession,
    enabled,
    retry: false,
    staleTime: Infinity,
  });
}

export function useBootstrapAdmin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: bootstrapAdmin,
    onSuccess: (user) => {
      client.setQueryData(authKeys.status, { initialized: true });
      client.setQueryData(authKeys.session, user);
    },
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => client.setQueryData(authKeys.session, user),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => client.setQueryData(authKeys.session, null),
  });
}
