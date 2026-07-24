import { Dialog } from '@base-ui/react/dialog'
import {
  CalendarClock,
  CheckCircle2,
  CloudUpload,
  DatabaseBackup,
  Download,
  FileCheck2,
  HardDriveDownload,
  KeyRound,
  Lock,
  LockOpen,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { useToast } from '@/components/feedback/toast-provider'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import type { ListParams } from '@/features/master-data/api'
import { useListUrlState } from '@/features/master-data/use-list-url-state'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDate } from '@/lib/date'
import { enumLabel } from '@/lib/enum-label'
import { downloadBackup, exportBackups, type BackupHistory, type BackupSystemStatus } from './api'
import { useBackupList, useBackupMutations, useBackupStatus } from './use-backups'

const statusText: Record<string, string> = {
  CREATING: '正在生成',
  UPLOADING: '正在上传',
  VERIFIED: '校验通过',
  FAILED: '失败',
  EXPIRED: '已按策略清理',
}

const triggerText: Record<string, string> = {
  MANUAL: '手工备份',
  STARTUP_COMPENSATION: '启动补偿',
  OPERATION_THRESHOLD: '业务量触发',
  PRE_RESTORE: '恢复前保护',
  BOOTSTRAP_IMPORT: 'Bootstrap 导入',
}

function formatBytes(value: string | number | undefined): string {
  const size = Number(value ?? 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(2)} GB`
}

function BackupStatusBadge({ status }: { status: string }) {
  return (
    <span className={`business-status backup-status-${status.toLowerCase()}`}>
      {statusText[status] ?? enumLabel(status)}
    </span>
  )
}

function columns(): DataTableColumn[] {
  return [
    {
      key: 'backupNo',
      label: '备份点',
      render: (row) => (
        <div className="backup-name-cell">
          <DatabaseBackup size={17} />
          <div>
            <strong>{String(row.backupNo)}</strong>
            <span>{triggerText[String(row.trigger)] ?? enumLabel(row.trigger)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态',
      render: (row) => <BackupStatusBadge status={String(row.status)} />,
    },
    { key: 'size', label: '大小', render: (row) => formatBytes(String(row.size)) },
    {
      key: 'fileAsset.provider',
      label: '存储位置',
      sortable: false,
      render: (row) =>
        (row.fileAsset as { provider?: string } | undefined)?.provider === 'ONEDRIVE'
          ? 'OneDrive Personal'
          : row.fileAsset
            ? '本地模拟 Provider'
            : '仅本地恢复副本',
    },
    {
      key: 'locked',
      label: '保留锁',
      render: (row) => (row.locked ? '永久保留' : '按策略管理'),
    },
    { key: 'completedAt', label: '完成时间' },
  ]
}

function BackupContext({ backup }: { backup?: BackupHistory }) {
  if (!backup) {
    return (
      <aside className="inventory-context empty backup-context">
        <DatabaseBackup size={30} />
        <p>选择一个恢复点，查看 Manifest、校验值和保护状态。</p>
      </aside>
    )
  }
  const counts = backup.manifest?.recordCounts ?? {}
  return (
    <aside className="inventory-context backup-context">
      <header>
        <DatabaseBackup size={18} />
        <h2>{backup.backupNo}</h2>
        <p>{triggerText[backup.trigger]} · PostgreSQL custom format</p>
      </header>
      <section>
        <h3>恢复点状态</h3>
        <dl className="quality-detail-list">
          <div>
            <dt>校验状态</dt>
            <dd>{statusText[backup.status]}</dd>
          </div>
          <div>
            <dt>文件大小</dt>
            <dd>{formatBytes(backup.size)}</dd>
          </div>
          <div>
            <dt>Schema</dt>
            <dd>{backup.schemaVersion}</dd>
          </div>
          <div>
            <dt>PostgreSQL</dt>
            <dd>{backup.postgresVersion ?? '—'}</dd>
          </div>
          <div>
            <dt>完成时间</dt>
            <dd>{formatDate(backup.completedAt)}</dd>
          </div>
          <div>
            <dt>保留策略</dt>
            <dd>{backup.locked ? '永久锁定' : '7 日 / 4 周 / 12 月'}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3>SHA-256</h3>
        <code className="file-hash">{backup.sha256 ?? '尚未生成'}</code>
      </section>
      <section>
        <h3>关键记录计数</h3>
        <div className="backup-count-grid">
          {Object.entries(counts).map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
          {!Object.keys(counts).length ? <p className="muted">暂无 Manifest 计数</p> : null}
        </div>
      </section>
      {backup.errorMessage ? (
        <section className="file-error-note">
          <h3>失败原因</h3>
          <p>{backup.errorMessage}</p>
        </section>
      ) : null}
    </aside>
  )
}

function RestoreDialog({
  backup,
  open,
  onOpenChange,
}: {
  backup?: BackupHistory
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutations = useBackupMutations()
  const notify = useToast()
  const [password, setPassword] = useState('')
  const [confirmPhrase, setConfirmPhrase] = useState('')
  if (!backup) return null
  const expected = `RESTORE ${backup.backupNo}`
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const result = await mutations.restore.mutateAsync({
        id: backup.id,
        password,
        confirmPhrase,
      })
      notify(`已恢复 ${result.backupNo}，恢复前保护点为 ${result.preRestoreBackupNo}`, 'success')
      onOpenChange(false)
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog-popup backup-restore-dialog">
            <header className="dialog-header">
              <div>
                <Dialog.Title>恢复数据库</Dialog.Title>
                <Dialog.Description>
                  系统将进入维护模式，并先自动创建 PRE_RESTORE 保护点。
                </Dialog.Description>
              </div>
              <Dialog.Close aria-label="关闭" className="icon-button">
                <X size={18} />
              </Dialog.Close>
            </header>
            <form className="dialog-form" onSubmit={submit}>
              <div className="restore-warning">
                <ShieldAlert size={22} />
                <div>
                  <strong>当前数据库会被恢复点覆盖</strong>
                  <span>
                    恢复前会验证 SHA-256、Schema 兼容性，并在完成后检查健康状态与关键表计数。
                  </span>
                </div>
              </div>
              <Field label="当前管理员密码">
                <Input
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              </Field>
              <Field label={`输入确认短语：${expected}`}>
                <Input
                  onChange={(event) => setConfirmPhrase(event.target.value)}
                  value={confirmPhrase}
                />
              </Field>
              <footer className="dialog-footer">
                <Dialog.Close className="button button-ghost">取消</Dialog.Close>
                <Button
                  disabled={mutations.restore.isPending || !password || confirmPhrase !== expected}
                  type="submit"
                  variant="danger"
                >
                  <RotateCcw size={16} />
                  {mutations.restore.isPending ? '正在安全恢复…' : '创建保护点并恢复'}
                </Button>
              </footer>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function StatusCards({ status }: { status?: BackupSystemStatus }) {
  const latest = status?.latest
  return (
    <section className="inventory-kpis backup-kpis" aria-label="备份概况">
      <article>
        <span>最近校验备份</span>
        <strong>{latest ? formatDate(latest.completedAt) : '尚未创建'}</strong>
        <small>{latest?.backupNo ?? '建议立即建立第一个恢复点'}</small>
      </article>
      <article>
        <span>上次备份后业务过账</span>
        <strong>{status?.operationsSinceLast ?? 0}</strong>
        <small>
          阈值 {status?.operationThreshold ?? 50} 次
          {status?.backupRecommended ? ' · 建议现在备份' : ' · 当前安全'}
        </small>
      </article>
      <article>
        <span>恢复保护</span>
        <strong>{status?.maintenance.active ? '维护模式' : '就绪'}</strong>
        <small>启动超过 {status?.autoAfterHours ?? 24} 小时且有变化时自动补偿</small>
      </article>
    </section>
  )
}

export function BackupPage() {
  const { params, keyword, setKeyword, setParam } = useListUrlState()
  const allowedSort = [
    'backupNo',
    'status',
    'trigger',
    'size',
    'startedAt',
    'completedAt',
    'verifiedAt',
    'createdAt',
  ]
  const listParams: ListParams = {
    ...params,
    sortBy: allowedSort.includes(params.sortBy) ? params.sortBy : 'completedAt',
  }
  const list = useBackupList(listParams)
  const status = useBackupStatus()
  const mutations = useBackupMutations()
  const notify = useToast()
  const rows = (list.data?.data ?? []) as BackupHistory[]
  const [activeId, setActiveId] = useState<string>()
  const [restoreId, setRestoreId] = useState<string>()
  const active = useMemo(() => rows.find((item) => item.id === activeId), [activeId, rows])
  const restoreTarget = rows.find((item) => item.id === restoreId)

  const task = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      notify(success, 'success')
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }

  return (
    <section className="page-section inventory-page backup-page">
      <header className="page-heading inventory-heading">
        <div>
          <span className="eyebrow">SYSTEM SAFETY · PHASE 8</span>
          <h1>数据库备份与恢复</h1>
          <p>Custom format、SHA-256 校验、OneDrive 归档与恢复前保护集中在同一工作台。</p>
        </div>
        <div className="page-actions">
          <Button
            disabled={mutations.create.isPending || status.data?.task.backupRunning}
            onClick={() => void task(() => mutations.create.mutateAsync(false), '备份已生成并校验')}
          >
            <DatabaseBackup size={16} />
            {mutations.create.isPending ? '正在备份…' : '立即备份'}
          </Button>
        </div>
      </header>

      <StatusCards status={status.data} />

      <section className="filter-bar inventory-filter-bar backup-filter-bar">
        <label className="search-box">
          <Search size={16} />
          <Input
            aria-label="搜索备份"
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索备份编号、SHA 或 Schema"
            value={keyword}
          />
        </label>
        <Select
          aria-label="备份状态"
          onChange={(event) => setParam('backupStatus', event.target.value || undefined)}
          value={params.backupStatus ?? ''}
        >
          <option value="">全部状态</option>
          {Object.entries(statusText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="触发方式"
          onChange={(event) => setParam('trigger', event.target.value || undefined)}
          value={params.trigger ?? ''}
        >
          <option value="">全部触发方式</option>
          {Object.entries(triggerText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="保留锁"
          onChange={(event) => setParam('locked', event.target.value || undefined)}
          value={params.locked ?? ''}
        >
          <option value="">全部保留状态</option>
          <option value="true">永久保留</option>
          <option value="false">按策略管理</option>
        </Select>
        <Button onClick={() => void exportBackups(listParams)} variant="ghost">
          <Download size={16} /> 导出 CSV
        </Button>
      </section>

      <div className="inventory-workspace backup-workspace">
        <div className="inventory-list-card">
          <DataTable
            activeRowId={activeId}
            actions={(row) => {
              const backup = row as BackupHistory
              const usable = backup.status === 'VERIFIED'
              return (
                <>
                  {backup.status !== 'EXPIRED' ? (
                    <button
                      aria-label={`下载 ${backup.backupNo}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void task(() => downloadBackup(backup), '备份下载已开始')
                      }}
                      type="button"
                    >
                      <HardDriveDownload size={16} />
                    </button>
                  ) : null}
                  {backup.status !== 'EXPIRED' ? (
                    <button
                      aria-label={`校验 ${backup.backupNo}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void task(
                          () => mutations.verify.mutateAsync(backup.id),
                          'SHA-256 与目录校验通过',
                        )
                      }}
                      type="button"
                    >
                      <FileCheck2 size={16} />
                    </button>
                  ) : null}
                  <button
                    aria-label={`${backup.locked ? '解除锁定' : '永久保留'} ${backup.backupNo}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      void task(
                        () => mutations.lock.mutateAsync({ id: backup.id, locked: !backup.locked }),
                        backup.locked ? '已解除永久保留' : '恢复点已永久保留',
                      )
                    }}
                    type="button"
                  >
                    {backup.locked ? <LockOpen size={16} /> : <Lock size={16} />}
                  </button>
                  {usable ? (
                    <button
                      aria-label={`恢复 ${backup.backupNo}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setRestoreId(backup.id)
                      }}
                      type="button"
                    >
                      <RotateCcw size={16} />
                    </button>
                  ) : null}
                </>
              )
            }}
            columns={columns()}
            error={list.error ? apiErrorMessage(list.error) : undefined}
            loading={list.isLoading}
            meta={list.data?.meta}
            onPageChange={(page) => setParam('page', String(page), false)}
            onPageSizeChange={(pageSize) => setParam('pageSize', String(pageSize))}
            onRowClick={(row) => setActiveId(row.id)}
            onSort={(key) => {
              setParam('sortBy', key)
              setParam(
                'sortOrder',
                listParams.sortBy === key && listParams.sortOrder === 'asc' ? 'desc' : 'asc',
              )
            }}
            rows={list.data?.data ?? []}
            sortBy={listParams.sortBy}
            sortOrder={listParams.sortOrder}
          />
        </div>
        <BackupContext backup={active} />
      </div>

      <section className="backup-safety-strip">
        <div>
          <CloudUpload size={18} />
          <span>
            <strong>上传后校验</strong>
            OneDrive 已连接时，备份和 Manifest 经 FileService 上传并重新下载校验。
          </span>
        </div>
        <div>
          <CalendarClock size={18} />
          <span>
            <strong>分层保留</strong>
            最近 7 日、4 周、12 月；锁定恢复点永不自动清理。
          </span>
        </div>
        <div>
          {status.data?.recoveryConfigured ? <CheckCircle2 size={18} /> : <KeyRound size={18} />}
          <span>
            <strong>Bootstrap 恢复</strong>
            {status.data?.recoveryConfigured
              ? '恢复密钥已配置，可在无 Schema 时上传恢复。'
              : '请配置 BOOTSTRAP_RECOVERY_KEY 以启用空库恢复。'}
          </span>
        </div>
      </section>

      <RestoreDialog
        backup={restoreTarget}
        onOpenChange={(open) => !open && setRestoreId(undefined)}
        open={Boolean(restoreTarget)}
      />
    </section>
  )
}
