import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import type { PropsWithChildren } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/feedback/toast-provider';

dayjs.locale('zh-cn');

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            borderRadius: 8,
            colorBorder: '#E2E4EE',
            colorPrimary: '#6558F5',
            colorText: '#202238',
            colorTextPlaceholder: '#687086',
          },
        }}
      >
        <BrowserRouter>
          <ToastProvider>{children}</ToastProvider>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
