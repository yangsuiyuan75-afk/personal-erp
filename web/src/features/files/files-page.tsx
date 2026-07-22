import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  CloudOff,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  FolderOpen,
  HardDrive,
  ImagePlus,
  Images,
  KeyRound,
  RefreshCcw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { useToast } from '@/components/feedback/toast-provider';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { ImagePreview } from '@/components/ui/image-preview';
import type { ListParams } from '@/features/master-data/api';
import { useListUrlState } from '@/features/master-data/use-list-url-state';
import { useMasterOptions } from '@/features/master-data/use-master-data';
import { apiErrorMessage } from '@/lib/api-error';
import {
  downloadFile,
  exportFiles,
  type DeviceCode,
  type FileAsset,
  type OneDriveStatusCode,
  type ProductImage,
} from './api';
import { FileUploadDialog } from './file-upload-dialog';
import {
  useFileMutations,
  useFileObjectUrl,
  useFilesList,
  useOneDriveStatus,
  useProductImages,
} from './use-files';

type FileView = 'assets' | 'gallery' | 'onedrive';

const views: Array<{ id: FileView; label: string; icon: typeof FolderOpen }> = [
  { id: 'assets', label: '文件资产', icon: FolderOpen },
  { id: 'gallery', label: '商品图库', icon: Images },
  { id: 'onedrive', label: 'OneDrive 设置', icon: Cloud },
];

const statusText: Record<string, string> = {
  PENDING: '待上传',
  UPLOADING: '上传中',
  SYNCED: '已同步',
  FAILED: '同步失败',
  DELETED: '已删除',
};

const providerText: Record<string, string> = {
  ONEDRIVE: 'OneDrive Personal',
  MOCK_LOCAL: '本地模拟 Provider',
};

const oneDriveStatusDetails: Array<{
  code: OneDriveStatusCode;
  label: string;
  description: string;
}> = [
  { code: 'CLIENT_ID_MISSING', label: '未配置 Client ID', description: '等待应用注册配置' },
  { code: 'NOT_CONNECTED', label: '未连接', description: 'Client ID 已就绪，尚未授权' },
  { code: 'AUTHORIZING', label: '正在授权', description: '等待设备代码登录完成' },
  { code: 'CONNECTED', label: '已连接', description: 'Graph 与个人网盘可用' },
  { code: 'REAUTH_REQUIRED', label: 'Token 需要重新授权', description: '缓存已失效或已迁移电脑' },
  { code: 'GRAPH_UNREACHABLE', label: 'Graph 不可达', description: '检查网络后重试' },
  { code: 'STORAGE_FULL', label: 'OneDrive 空间不足', description: '释放容量后继续同步' },
];

function formatBytes(value: number | undefined): string {
  const size = Number(value ?? 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

function FileStatus({ value }: { value: unknown }) {
  const status = String(value);
  return (
    <span className={`business-status file-status-${status.toLowerCase()}`}>
      {statusText[status] ?? status}
    </span>
  );
}

function SecureImage({ fileAssetId, alt }: { fileAssetId: string; alt: string }) {
  const image = useFileObjectUrl(fileAssetId);
  if (image.isError) {
    return (
      <div className="file-image-state error">
        <CloudOff size={20} />
        <span>图片不可用</span>
      </div>
    );
  }
  if (!image.url) {
    return (
      <div className="file-image-state loading">
        <RefreshCcw size={19} />
        <span>安全加载中</span>
      </div>
    );
  }
  return <ImagePreview alt={alt} src={image.url} />;
}

function fileColumns(): DataTableColumn[] {
  return [
    {
      key: 'fileName',
      label: '文件',
      render: (row) => (
        <div className="file-name-cell">
          {String(row.mimeType).startsWith('image/') ? (
            <FileImage size={17} />
          ) : (
            <FileText size={17} />
          )}
          <div>
            <strong>{String(row.fileName)}</strong>
            <span>{String(row.mimeType)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'provider',
      label: 'Storage Provider',
      render: (row) => providerText[String(row.provider)] ?? String(row.provider),
    },
    { key: 'logicalPath', label: '逻辑目录' },
    { key: 'size', label: '大小', render: (row) => formatBytes(Number(row.size)) },
    { key: 'status', label: '状态', render: (row) => <FileStatus value={row.status} /> },
    { key: 'createdAt', label: '创建时间' },
  ];
}

function FileContext({ file }: { file?: FileAsset }) {
  if (!file) {
    return (
      <aside className="inventory-context empty file-context">
        <FolderOpen size={30} />
        <p>选择一条文件资产，查看存储位置、校验值和业务引用。</p>
      </aside>
    );
  }
  return (
    <aside className="inventory-context file-context">
      <header>
        <FileText size={18} />
        <h2>{file.fileName}</h2>
        <p>{file.logicalPath}</p>
      </header>
      <section>
        <h3>存储状态</h3>
        <dl className="quality-detail-list">
          <div>
            <dt>Provider</dt>
            <dd>{providerText[file.provider]}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{statusText[file.status]}</dd>
          </div>
          <div>
            <dt>文件大小</dt>
            <dd>{formatBytes(file.size)}</dd>
          </div>
          <div>
            <dt>Drive / Item</dt>
            <dd title={`${file.driveId}/${file.itemId}`}>{file.itemId.slice(0, 12)}…</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3>完整性校验</h3>
        <code className="file-hash">{file.sha256}</code>
      </section>
      <section>
        <h3>业务引用</h3>
        {file.productImage ? (
          <div className="file-reference">
            <Images size={15} />
            <span>
              {file.productImage.product.code} · {file.productImage.product.name}
            </span>
          </div>
        ) : null}
        {file.associations.map((item) => (
          <div className="file-reference" key={item.id}>
            <FileText size={15} />
            <span>
              {item.module} / {item.entityType} / {item.entityId}
            </span>
          </div>
        ))}
        {!file.productImage && file.associations.length === 0 ? (
          <p className="muted">当前为独立文件资产</p>
        ) : null}
      </section>
      {file.lastError ? (
        <section className="file-error-note">
          <h3>最近错误</h3>
          <p>{file.lastError}</p>
        </section>
      ) : null}
    </aside>
  );
}

function AssetsView({
  params,
  keyword,
  setKeyword,
  setParam,
}: {
  params: ListParams;
  keyword: string;
  setKeyword: (value: string) => void;
  setParam: (key: string, value?: string, resetPage?: boolean) => void;
}) {
  const notify = useToast();
  const mutations = useFileMutations();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const allowedSort = [
    'createdAt',
    'updatedAt',
    'fileName',
    'size',
    'status',
    'provider',
    'logicalPath',
  ];
  const listParams = {
    ...params,
    sortBy: allowedSort.includes(params.sortBy) ? params.sortBy : 'createdAt',
  };
  const query = useFilesList(listParams);
  const rows = (query.data?.data ?? []) as FileAsset[];
  const active = rows.find((row) => row.id === activeId);
  const handle = async (task: () => Promise<unknown>, success: string) => {
    try {
      await task();
      notify(success, 'success');
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <>
      <section className="filter-bar inventory-filter-bar file-filter-bar">
        <label className="search-box">
          <Search size={16} />
          <Input
            aria-label="搜索文件"
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索文件名、逻辑目录或 SHA-256"
            value={keyword}
          />
        </label>
        <Select
          aria-label="存储提供方"
          onChange={(event) => setParam('provider', event.target.value || undefined)}
          value={params.provider ?? ''}
        >
          <option value="">全部 Provider</option>
          <option value="ONEDRIVE">OneDrive Personal</option>
          <option value="MOCK_LOCAL">本地模拟 Provider</option>
        </Select>
        <Select
          aria-label="文件状态"
          onChange={(event) => setParam('fileStatus', event.target.value || undefined)}
          value={params.fileStatus ?? ''}
        >
          <option value="">全部状态</option>
          {Object.entries(statusText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button onClick={() => void exportFiles(listParams)} variant="ghost">
          <Download size={16} /> 导出 CSV
        </Button>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload size={16} /> 上传文件
        </Button>
      </section>
      <div className="inventory-workspace file-workspace">
        <div className="inventory-list-card">
          <DataTable
            activeRowId={activeId}
            actions={(row) => {
              const file = row as FileAsset;
              return (
                <>
                  {file.status !== 'DELETED' ? (
                    <button
                      aria-label={`下载 ${file.fileName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handle(() => downloadFile(file), '文件下载已开始');
                      }}
                      type="button"
                    >
                      <Download size={16} />
                    </button>
                  ) : null}
                  {file.status === 'FAILED' ? (
                    <button
                      aria-label={`重试 ${file.fileName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handle(() => mutations.retry.mutateAsync(file.id), '文件同步已恢复');
                      }}
                      type="button"
                    >
                      <RefreshCcw size={16} />
                    </button>
                  ) : null}
                  {!file.productImage &&
                  file.associations.length === 0 &&
                  file.status !== 'DELETED' ? (
                    <button
                      aria-label={`删除 ${file.fileName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (window.confirm(`确认删除文件“${file.fileName}”？`)) {
                          void handle(() => mutations.remove.mutateAsync(file.id), '文件已删除');
                        }
                      }}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </>
              );
            }}
            columns={fileColumns()}
            error={query.error ? apiErrorMessage(query.error) : undefined}
            loading={query.isLoading}
            meta={query.data?.meta}
            onPageChange={(page) => setParam('page', String(page), false)}
            onPageSizeChange={(size) => setParam('pageSize', String(size))}
            onRowClick={(row) => setActiveId(row.id)}
            onSort={(key) => {
              setParam('sortBy', key);
              setParam(
                'sortOrder',
                listParams.sortBy === key && listParams.sortOrder === 'asc' ? 'desc' : 'asc',
              );
            }}
            rows={query.data?.data ?? []}
            sortBy={listParams.sortBy}
            sortOrder={listParams.sortOrder}
          />
        </div>
        <FileContext file={active} />
      </div>
      <FileUploadDialog onOpenChange={setUploadOpen} open={uploadOpen} />
    </>
  );
}

function GalleryCard({
  image,
  index,
  total,
  pending,
  onPrimary,
  onMove,
  onDelete,
}: {
  image: ProductImage;
  index: number;
  total: number;
  pending: boolean;
  onPrimary: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <article className={`product-image-card ${image.isPrimary ? 'primary' : ''}`}>
      <div className="product-image-preview">
        <SecureImage alt={image.fileAsset.fileName} fileAssetId={image.fileAssetId} />
        {image.isPrimary ? (
          <span className="primary-image-badge">
            <Star size={12} /> 主图
          </span>
        ) : null}
      </div>
      <div className="product-image-meta">
        <strong title={image.fileAsset.fileName}>{image.fileAsset.fileName}</strong>
        <span>
          #{index + 1} · {formatBytes(image.fileAsset.size)} ·{' '}
          {providerText[image.fileAsset.provider]}
        </span>
      </div>
      <footer>
        <button disabled={index === 0 || pending} onClick={() => onMove(-1)} type="button">
          <ArrowLeft size={15} />
        </button>
        <button disabled={index === total - 1 || pending} onClick={() => onMove(1)} type="button">
          <ArrowRight size={15} />
        </button>
        <button disabled={image.isPrimary || pending} onClick={onPrimary} type="button">
          <Star size={15} /> 设为主图
        </button>
        <button className="danger" disabled={pending} onClick={onDelete} type="button">
          <Trash2 size={15} />
        </button>
      </footer>
    </article>
  );
}

function GalleryView({
  params,
  setParam,
}: {
  params: ListParams;
  setParam: (key: string, value?: string, resetPage?: boolean) => void;
}) {
  const notify = useToast();
  const products = useMasterOptions('products');
  const mutations = useFileMutations();
  const firstProduct = products.data?.data[0]?.id;
  const productId = params.productId ?? firstProduct;
  const gallery = useProductImages(productId);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [makePrimary, setMakePrimary] = useState(false);

  useEffect(() => {
    if (!params.productId && firstProduct) setParam('productId', firstProduct);
  }, [firstProduct, params.productId]);

  const pending =
    mutations.uploadImages.isPending ||
    mutations.primary.isPending ||
    mutations.reorder.isPending ||
    mutations.removeImage.isPending;
  const handle = async (task: () => Promise<unknown>, success: string) => {
    try {
      await task();
      notify(success, 'success');
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  const upload = async () => {
    if (!productId || selectedFiles.length === 0) {
      notify('请先选择商品和图片', 'error');
      return;
    }
    await handle(
      () =>
        mutations.uploadImages.mutateAsync({
          productId,
          files: selectedFiles,
          isPrimary: makePrimary,
        }),
      '商品图片已上传',
    );
    setSelectedFiles([]);
    setMakePrimary(false);
  };
  const move = (index: number, direction: -1 | 1) => {
    if (!productId || !gallery.data) return;
    const ids = gallery.data.images.map((image) => image.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void handle(
      () => mutations.reorder.mutateAsync({ productId, imageIds: ids }),
      '图片顺序已更新',
    );
  };

  return (
    <div className="product-gallery-workspace">
      <section className="filter-bar gallery-toolbar">
        <Select
          aria-label="选择商品"
          onChange={(event) => setParam('productId', event.target.value || undefined)}
          value={productId ?? ''}
        >
          <option value="">选择商品</option>
          {products.data?.data.map((product) => (
            <option key={product.id} value={product.id}>
              {product.code} · {product.name}
            </option>
          ))}
        </Select>
        <label className="gallery-file-picker">
          <ImagePlus size={16} />
          <span>
            {selectedFiles.length ? `已选 ${selectedFiles.length} 张图片` : '选择 JPG / PNG / WEBP'}
          </span>
          <input
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []).slice(0, 8))}
            type="file"
          />
        </label>
        <label className="gallery-primary-toggle">
          <input
            checked={makePrimary}
            onChange={(event) => setMakePrimary(event.target.checked)}
            type="checkbox"
          />
          首张设为主图
        </label>
        <Button disabled={pending || !selectedFiles.length} onClick={() => void upload()}>
          <Upload size={16} /> {pending ? '正在处理…' : '上传图片'}
        </Button>
      </section>
      <section className="gallery-summary">
        <div>
          <span>当前商品</span>
          <strong>
            {gallery.data
              ? `${gallery.data.product.code} · ${gallery.data.product.name}`
              : '尚未选择'}
          </strong>
        </div>
        <div>
          <span>图片数量</span>
          <strong>{gallery.data?.images.length ?? 0} / 12</strong>
        </div>
        <div>
          <span>存储规则</span>
          <strong>主图唯一 · 顺序可追溯</strong>
        </div>
      </section>
      {gallery.isLoading ? (
        <div className="gallery-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="gallery-skeleton" key={index} />
          ))}
        </div>
      ) : gallery.error ? (
        <div className="gallery-empty error">
          <CloudOff size={28} />
          <strong>商品图片加载失败</strong>
          <span>{apiErrorMessage(gallery.error)}</span>
        </div>
      ) : !gallery.data?.images.length ? (
        <div className="gallery-empty">
          <Images size={32} />
          <strong>该商品还没有图片</strong>
          <span>选择多张图片后上传，首张图片会自动成为主图。</span>
        </div>
      ) : (
        <div className="gallery-grid">
          {gallery.data.images.map((image, index) => (
            <GalleryCard
              image={image}
              index={index}
              key={image.id}
              onDelete={() => {
                if (productId && window.confirm(`确认删除图片“${image.fileAsset.fileName}”？`)) {
                  void handle(
                    () => mutations.removeImage.mutateAsync({ productId, imageId: image.id }),
                    '商品图片已删除',
                  );
                }
              }}
              onMove={(direction) => move(index, direction)}
              onPrimary={() => {
                if (productId)
                  void handle(
                    () => mutations.primary.mutateAsync({ productId, imageId: image.id }),
                    '商品主图已更新',
                  );
              }}
              pending={pending}
              total={gallery.data.images.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OneDriveView() {
  const notify = useToast();
  const status = useOneDriveStatus();
  const mutations = useFileMutations();
  const [deviceCode, setDeviceCode] = useState<DeviceCode>();
  const [remaining, setRemaining] = useState(0);
  const current = status.data;

  useEffect(() => {
    const code = deviceCode ?? current?.deviceCode;
    if (!code) return;
    const update = () =>
      setRemaining(
        Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - Date.now()) / 1000)),
      );
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [current?.deviceCode, deviceCode]);

  const connect = async () => {
    try {
      const code = await mutations.connect.mutateAsync();
      setDeviceCode(code);
      notify('设备授权已启动，请在 Microsoft 页面输入验证码', 'info');
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  const disconnect = async () => {
    try {
      await mutations.disconnect.mutateAsync();
      setDeviceCode(undefined);
      notify('OneDrive 连接已移除', 'success');
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  const code = deviceCode ?? current?.deviceCode;
  const quota = current?.drive?.quota;
  const quotaPercent = quota?.total
    ? Math.min(100, (Number(quota.used ?? 0) / quota.total) * 100)
    : 0;

  return (
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
              ? 'Public Client Device Code Flow，无 Client Secret。'
              : '配置 Client ID 前，本地模拟 Provider 保持完整可用。'}
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
              <span>唯一需要用户补充的外部配置</span>
            </div>
          </header>
          <code>MICROSOFT_CLIENT_ID=你的应用程序_Client_ID</code>
          <ol>
            <li>应用注册选择 Personal Microsoft accounts。</li>
            <li>启用 Public client flow，不创建 Client Secret。</li>
            <li>添加 User.Read、Files.ReadWrite、offline_access。</li>
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
                notify('验证码已复制', 'success');
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
              {current.drive.type} · {current.drive.id.slice(0, 12)}…
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
            <h2>连接状态全集</h2>
          </header>
          {oneDriveStatusDetails.map((item) => (
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
            <h2>授权与存储策略</h2>
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
              <span>数据库只保存相对 logicalPath 与 FileAsset 元数据。</span>
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
  );
}

export function FilesPage() {
  const [search] = useSearchParams();
  const { params, keyword, setKeyword, setParam } = useListUrlState();
  const rawView = search.get('view');
  const view: FileView = views.some((item) => item.id === rawView)
    ? (rawView as FileView)
    : 'assets';
  const status = useOneDriveStatus();
  const kpis = useMemo(
    () => [
      {
        label: '当前 Storage Provider',
        value: status.data?.code === 'CONNECTED' ? 'OneDrive' : '本地模拟',
        note: '业务模块统一经过 FileService',
      },
      {
        label: 'OneDrive 状态',
        value: status.data?.label ?? '正在检查',
        note: status.data?.externalConfigurationStatus ?? '检查中',
      },
      { label: '文件安全', value: 'SHA-256', note: '图片不入库 · Token 不明文落库' },
    ],
    [status.data],
  );

  return (
    <div className="inventory-page files-page">
      <header className="page-heading inventory-heading">
        <div>
          <span className="eyebrow">FILE ASSET CENTER</span>
          <h1>文件与商品图片</h1>
          <p>统一管理文件元数据、商品多图和 Microsoft Graph OneDrive Personal。</p>
        </div>
        <div className="page-actions">
          <span
            className={`storage-provider-chip ${status.data?.code === 'CONNECTED' ? 'connected' : ''}`}
          >
            {status.data?.code === 'CONNECTED' ? <Cloud size={15} /> : <HardDrive size={15} />}
            {status.data?.code === 'CONNECTED' ? 'OneDrive' : 'Mock Provider'}
          </span>
        </div>
      </header>
      <section className="inventory-kpis file-kpis">
        {kpis.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>
      <nav aria-label="文件中心视图" className="inventory-tabs file-tabs">
        {views.map((item) => (
          <button
            className={view === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => setParam('view', item.id)}
            type="button"
          >
            <item.icon size={15} /> {item.label}
          </button>
        ))}
      </nav>
      {view === 'assets' ? (
        <AssetsView keyword={keyword} params={params} setKeyword={setKeyword} setParam={setParam} />
      ) : view === 'gallery' ? (
        <GalleryView params={params} setParam={setParam} />
      ) : (
        <OneDriveView />
      )}
    </div>
  );
}
