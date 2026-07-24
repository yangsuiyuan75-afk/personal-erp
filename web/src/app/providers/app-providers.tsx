import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { useSyncExternalStore, type PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '@/components/feedback/toast-provider'
import { isRequestLoading, subscribeRequestLoading } from '@/lib/axios/client'

dayjs.locale('zh-cn')

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
})

function RequestLoadingIndicator() {
  const loading = useSyncExternalStore(subscribeRequestLoading, isRequestLoading, isRequestLoading)
  if (!loading) return null
  return createPortal(
    <div aria-live="polite" className="request-loading-indicator" role="status">
      <span className="spinner" /> 正在请求数据…
    </div>,
    document.body,
  )
}

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
          <ToastProvider>
            {children}
            <RequestLoadingIndicator />
          </ToastProvider>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
