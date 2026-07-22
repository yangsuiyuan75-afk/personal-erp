import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from './app';

vi.mock('@/features/auth/use-auth', () => ({
  useAuthStatus: () => ({ data: { initialized: true }, isLoading: false, isError: false }),
  useSession: () => ({ data: { id: 'admin-id', username: 'admin' }, isLoading: false }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/health/use-health', () => ({
  useHealth: () => ({
    data: { status: 'operational', database: 'connected', checkedAt: new Date().toISOString() },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

describe('App', () => {
  it('shows the authenticated workbench and service state', () => {
    render(
      <MemoryRouter initialEntries={['/workbench']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '开始配置你的 Personal ERP' })).toBeVisible();
    expect(screen.getByText('本地服务运行正常')).toBeVisible();
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeVisible();
  });
});
