import { Check, Cloud, Copy, ExternalLink, HardDrive, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/feedback/toast-provider';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api-error';
import type { DeviceCode, OneDriveStatusCode } from './api';
import { useOneDriveMutations, useOneDriveStatus } from './use-files';

const statusDetails: Array<{ code: OneDriveStatusCode; label: string; description: string }> = [
  { code: 'CLIENT_ID_MISSING', label: '未配置 Client ID', description: '等待应用注册配置' },
  { code: 'NOT_CONNECTED', label: '未连接', description: 'Client ID 已就绪，尚未授权' },
  { code: 'AUTHORIZING', label: '正在授权', description: '等待设备代码登录完成' },
  { code: 'CONNECTED', label: '已连接', description: 'Graph 与个人网盘可用' },
  { code: 'REAUTH_REQUIRED', label: '需要重新授权', description: '缓存失效或已迁移设备' },
  { code: 'GRAPH_UNREACHABLE', label: 'Graph 不可达', description: '检查网络后重试' },
  { code: 'STORAGE_FULL', label: 'OneDrive 空间不足', description: '释放容量后继续备份' },
];

function formatBytes(value: number | undefined): string {
  const size = Number(value ?? 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

export function FilesPage() {
  const notify = useToast();
  const status = useOneDriveStatus();
  const mutations = useOneDriveMutations();
  const [deviceCode, setDeviceCode] = useState<DeviceCode>();
  const [remaining, setRemaining] = useState(0);
  const current = status.data;
  const code = deviceCode ?? current?.deviceCode;
  const quota = current?.drive?.quota;
  const quotaPercent = quota?.total
    ? Math.min(100, (Number(quota.used ?? 0) / quota.total) * 100)
    : 0;

  useEffect(() => {
    if (!code) return;
    const update = () =>
      setRemaining(
        Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - Date.now()) / 1000)),
      );
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [code]);

  const connect = async () => {
    try {
      setDeviceCode(await mutations.connect.mutateAsync());
      notify('设备授权已启动，请在 Microsoft 页面输入验证码。', 'info');
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };

  const disconnect = async () => {
    try {
      await mutations.disconnect.mutateAsync();
      setDeviceCode(undefined);
      notify('OneDrive 连接已移除。', 'success');
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };

  return (
    <section className="page-section files-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">INTEGRATION SETTINGS</span>
          <h1>OneDrive 设置</h1>
          <p>管理备份使用的 Microsoft OneDrive Personal 授权、连接状态与存储空间。</p>
        </div>
      </header>

      <div className="onedrive-settings">
        <section
          className={`onedrive-hero state-${(current?.code ?? 'NOT_CONNECTED').toLowerCase()}`}
        >
          <div className="onedrive-mark">
            {current?.code === 'CONNECTED' ? <Check size={28} /> : <Cloud size={28} />}
          </div>
          <div>
            <span>Microsoft Graph · OneDrive Personal</span>
            <h2>{status.isLoading ? '正在检查连接…' : (current?.label ?? '未连接')}</h2>
            <p>
              {current?.configured
                ? '使用 Public Client Device Code Flow，不需要 Client Secret。'
                : '配置 Client ID 前，系统会继续使用本地模拟存储完成备份。'}
            </p>
          </div>
          <div className="onedrive-actions">
            <Button
              disabled={!current?.configured || mutations.connect.isPending}
              onClick={() => void connect()}
            >
              <KeyRound size={16} />
              {current?.code === 'REAUTH_REQUIRED' ? '重新授权' : '连接 OneDrive'}
            </Button>
            {current?.account ? (
              <Button onClick={() => void disconnect()} variant="ghost">
                断开连接
              </Button>
            ) : null}
          </div>
        </section>

        {!current?.configured ? (
          <section className="external-config-card">
            <header>
              <ShieldCheck size={19} />
              <div>
                <strong>WAITING_FOR_EXTERNAL_CONFIGURATION</strong>
                <span>需要补充 Microsoft 应用注册配置</span>
              </div>
            </header>
            <code>MICROSOFT_CLIENT_ID=你的应用程序_Client_ID</code>
            <ol>
              <li>应用注册选择 Personal Microsoft accounts。</li>
              <li>启用 Public client flow，不创建 Client Secret。</li>
              <li>添加 User.Read、Files.ReadWrite、offline_access 权限。</li>
              <li>保存配置并重启服务，然后回到此页连接。</li>
            </ol>
          </section>
        ) : null}

        {code ? (
          <section className="device-code-card">
            <header>
              <KeyRound size={20} />
              <div>
                <strong>正在授权</strong>
                <span>
                  验证码将在 {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}{' '}
                  后失效
                </span>
              </div>
            </header>
            <div className="device-code-value">
              <strong>{code.userCode}</strong>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(code.userCode);
                  notify('验证码已复制。', 'success');
                }}
                type="button"
              >
                <Copy size={16} /> 复制
              </button>
            </div>
            <a href={code.verificationUri} rel="noreferrer" target="_blank">
              打开 Microsoft 设备登录页 <ExternalLink size={15} />
            </a>
          </section>
        ) : null}

        {current?.drive ? (
          <section className="onedrive-account-grid">
            <article>
              <span>授权账户</span>
              <strong>{current.account?.displayName ?? current.account?.username}</strong>
              <small>{current.account?.username}</small>
            </article>
            <article>
              <span>个人网盘</span>
              <strong>{current.drive.rootFolder}</strong>
              <small>
                {current.drive.type === 'personal' ? '个人网盘' : current.drive.type} ·{' '}
                {current.drive.id.slice(0, 12)}…
              </small>
            </article>
            <article className="quota-card">
              <span>空间使用</span>
              <strong>{formatBytes(quota?.remaining)} 可用</strong>
              <i>
                <b style={{ width: `${quotaPercent}%` }} />
              </i>
              <small>
                {formatBytes(quota?.used)} / {formatBytes(quota?.total)}
              </small>
            </article>
          </section>
        ) : null}

        <section className="onedrive-details-grid">
          <article className="onedrive-state-list">
            <header>
              <span>状态诊断</span>
              <h2>连接状态全览</h2>
            </header>
            {statusDetails.map((item) => (
              <div className={current?.code === item.code ? 'active' : ''} key={item.code}>
                <i />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                {current?.code === item.code ? <Check size={16} /> : null}
              </div>
            ))}
          </article>
          <article className="onedrive-security-card">
            <header>
              <span>安全边界</span>
              <h2>授权与备份策略</h2>
            </header>
            <div className="security-row">
              <ShieldCheck size={18} />
              <div>
                <strong>加密 MSAL Cache</strong>
                <span>Token 不以明文进入数据库、日志或前端。</span>
              </div>
            </div>
            <div className="security-row">
              <HardDrive size={18} />
              <div>
                <strong>ERP_STORAGE</strong>
                <span>仅保存备份所需的相对路径与内部元数据。</span>
              </div>
            </div>
            <div className="scope-list">
              {(current?.scopes ?? ['User.Read', 'Files.ReadWrite', 'offline_access']).map(
                (scope) => (
                  <code key={scope}>{scope}</code>
                ),
              )}
            </div>
            <dl className="quality-detail-list">
              <div>
                <dt>Authority</dt>
                <dd>consumers</dd>
              </div>
              <div>
                <dt>Client 类型</dt>
                <dd>Public Client</dd>
              </div>
              <div>
                <dt>授权方式</dt>
                <dd>Device Code Flow</dd>
              </div>
              <div>
                <dt>Client Secret</dt>
                <dd>不使用</dd>
              </div>
            </dl>
          </article>
        </section>
      </div>
    </section>
  );
}
