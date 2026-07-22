import { AppRouter } from '@/app/router/app-router';
import { FullPageLoading } from '@/components/feedback/full-page-loading';
import { AuthPage } from '@/features/auth/auth-page';
import { useAuthStatus, useSession } from '@/features/auth/use-auth';

export function App() {
  const status = useAuthStatus();
  const session = useSession(status.data?.initialized === true);

  if (status.isLoading || (status.data?.initialized && session.isLoading))
    return <FullPageLoading />;
  if (status.isError) return <FullPageLoading label="无法连接本地 API，请确认服务已启动。" />;
  if (!status.data?.initialized) return <AuthPage mode="bootstrap" />;
  if (!session.data) return <AuthPage mode="login" />;
  return <AppRouter />;
}
