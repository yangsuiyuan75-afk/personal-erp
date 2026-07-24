import { ArrowRight, CheckCircle2, Database, PackageSearch, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useHealth } from '@/features/health/use-health'

const steps = [
  {
    title: '建立商品结构',
    text: '先创建类目、单位、产品与 SKU。',
    to: '/master/categories',
    icon: PackageSearch,
  },
  {
    title: '完善交易对手',
    text: '维护供应商、采购渠道、销售渠道与客户。',
    to: '/master/suppliers',
    icon: ShieldCheck,
  },
]

export function WorkbenchPage() {
  const health = useHealth()
  return (
    <section className="page-section workbench-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">工作台</span>
          <h1>开始配置你的 Personal ERP</h1>
          <p>先完成基础资料，随后即可导入期初库存并进入完整业务闭环。</p>
        </div>
      </header>
      <div className="health-banner">
        <div
          className={health.data?.status === 'operational' ? 'health-dot connected' : 'health-dot'}
        >
          <Database />
        </div>
        <div>
          <strong>
            {health.data?.status === 'operational' ? '本地服务运行正常' : '正在检查本地服务'}
          </strong>
          <span>
            API 与 PostgreSQL {health.data?.database === 'connected' ? '已连接' : '等待连接'}
          </span>
        </div>
        {health.data?.status === 'operational' ? <CheckCircle2 className="health-check" /> : null}
      </div>
      <div className="setup-grid">
        {steps.map(({ title, text, to, icon: Icon }, index) => (
          <Link className="setup-step" key={to} to={to}>
            <span className="step-number">0{index + 1}</span>
            <Icon aria-hidden />
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
            <ArrowRight aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  )
}
