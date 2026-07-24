import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  DatabaseBackup,
  Home,
  LogOut,
  Monitor,
  Moon,
  PackageSearch,
  Settings,
  ShoppingCart,
  Store,
  Sun,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useLogout } from '@/features/auth/use-auth'
import { Select } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { useUiStore, type Theme } from '@/stores/ui-store'

const groups = [
  { label: '工作台', items: [[Home, '工作台', '/workbench']] },
  {
    label: '商品中心',
    items: [
      [PackageSearch, '商品类目', '/master/categories'],
      [PackageSearch, '产品', '/master/products'],
      [Boxes, 'SKU', '/master/skus'],
      [Boxes, '基础单位', '/master/units'],
    ],
  },
  {
    label: '采购资料',
    items: [
      [ShoppingCart, '供应商', '/master/suppliers'],
      [ShoppingCart, '采购渠道', '/master/purchase-channels'],
      [ShoppingCart, '采购员', '/master/buyers'],
    ],
  },
  {
    label: '销售资料',
    items: [
      [Store, '销售渠道', '/master/sales-channels'],
      [Store, '客户', '/master/customers'],
    ],
  },
  {
    label: '业务中心',
    items: [
      [Boxes, '库存中心', '/inventory'],
      [ShoppingCart, '采购管理', '/purchase'],
      [Store, '销售管理', '/sales'],
      [ClipboardCheck, '质量管理', '/quality'],
      [CircleDollarSign, '财务管理', '/finance'],
    ],
  },
  {
    label: '系统',
    items: [
      [DatabaseBackup, '备份恢复', '/backups'],
      [Settings, 'OneDrive 设置', '/files'],
      [Settings, '审计日志', '/audit'],
    ],
  },
] as const

const pageTitles: Record<string, string> = {
  '/workbench': '工作台',
  '/audit': '审计日志',
  '/inventory': '库存中心',
  '/purchase': '采购管理',
  '/sales': '销售管理',
  '/quality': '质量管理',
  '/finance': '财务管理',
  '/files': 'OneDrive 设置',
  '/backups': '备份恢复',
}

function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function AppLayout() {
  const location = useLocation()
  const logout = useLogout()
  const accountMenu = useRef<HTMLDetailsElement>(null)
  const { sidebarCollapsed, theme, setTheme, toggleSidebar } = useUiStore()
  const pageTitle = pageTitles[location.pathname] ?? '基础资料'

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const listener = () => applyTheme('system')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [theme])

  useEffect(() => {
    const closeAccountMenu = (event: PointerEvent) => {
      if (!accountMenu.current?.contains(event.target as Node))
        accountMenu.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', closeAccountMenu)
    return () => document.removeEventListener('pointerdown', closeAccountMenu)
  }, [])

  return (
    <div className={cn('erp-shell', sidebarCollapsed && 'sidebar-collapsed')}>
      <aside className="erp-sidebar">
        <div className="erp-brand">
          <span>人</span>
          <div>
            <strong>Personal ERP</strong>
            <small>本地运行 · 单人使用</small>
          </div>
        </div>
        <nav aria-label="主导航">
          {groups.map((group) => (
            <section className="nav-group" key={group.label}>
              <small>{group.label}</small>
              {group.items.map(([Icon, label, to]) => (
                <NavLink
                  className={({ isActive }) => cn('erp-nav-item', isActive && 'active')}
                  key={to}
                  to={to}
                >
                  <Icon aria-hidden size={18} strokeWidth={1.8} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
        <button
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          className="sidebar-toggle"
          onClick={toggleSidebar}
          type="button"
        >
          {sidebarCollapsed ? (
            <ChevronRight size={17} />
          ) : (
            <>
              <ChevronLeft size={17} />
              <span>收起菜单</span>
            </>
          )}
        </button>
      </aside>
      <main className="erp-main">
        <header className="erp-topbar">
          <h2>{pageTitle}</h2>
          <div className="topbar-actions">
            <label className="theme-control">
              {theme === 'light' ? (
                <Sun size={16} />
              ) : theme === 'dark' ? (
                <Moon size={16} />
              ) : (
                <Monitor size={16} />
              )}
              <Select
                aria-label="主题"
                onChange={(event) => setTheme(event.target.value as Theme)}
                value={theme}
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="system">跟随系统</option>
              </Select>
            </label>
            <details className="account-menu" ref={accountMenu}>
              <summary>
                <span>管</span>
                <strong>管理员</strong>
              </summary>
              <div>
                <button onClick={() => logout.mutate()} type="button">
                  <LogOut size={15} /> 退出登录
                </button>
              </div>
            </details>
          </div>
        </header>
        <div className="erp-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
