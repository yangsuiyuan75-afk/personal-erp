export function FullPageLoading({ label = '正在加载本地工作区…' }: { label?: string }) {
  return (
    <div className="full-page-loading" role="status">
      <span className="spinner" />
      <p>{label}</p>
    </div>
  )
}
