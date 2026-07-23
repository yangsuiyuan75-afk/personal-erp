import { Download, Image as ImageIcon, Pencil, Plus, Power, RotateCcw, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { useToast } from '@/components/feedback/toast-provider';
import { Button } from '@/components/ui/button';
import { DateRangePickerInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/field';
import { ImagePreview } from '@/components/ui/image-preview';
import { apiErrorMessage } from '@/lib/api-error';
import { enumLabel } from '@/lib/enum-label';
import { exportMasterData, type MasterRow } from './api';
import { masterConfigs, type MasterConfig } from './config';
import { DeactivateDialog } from './deactivate-dialog';
import { MasterDataFormDialog } from './master-data-form-dialog';
import { useListUrlState } from './use-list-url-state';
import { useMasterList, useMasterMutations, useProductImageUrl } from './use-master-data';

const inventoryModeLabels: Record<string, string> = {
  DIRECT_FROM_LOCATION: '指定仓库直发',
  EXTERNAL_WAREHOUSE: '外部平台仓',
  VIRTUAL_ALLOCATION: '虚拟渠道额度',
};

function inventoryModeLabel(value: unknown) {
  if (value == null || value === '') return '—';
  return inventoryModeLabels[String(value)] ?? enumLabel(value);
}

type ProductImageAsset = { fileAssetId: string; fileAsset?: { id: string; fileName: string } };

function ProductThumbnail({ row, large = false }: { row: MasterRow; large?: boolean }) {
  const image = (row.images as ProductImageAsset[] | undefined)?.[0];
  const content = useProductImageUrl(row.id, image?.fileAssetId);
  if (image?.fileAsset?.id && content.url) {
    return (
      <ImagePreview
        alt={image.fileAsset.fileName ?? row.name}
        className={`product-thumbnail ${large ? 'large' : ''}`}
        src={content.url}
      />
    );
  }
  return (
    <div
      aria-label="暂无产品图片"
      className={`product-thumbnail placeholder ${large ? 'large' : ''}`}
    >
      <ImageIcon size={large ? 30 : 18} />
    </div>
  );
}

function detailFieldValue(
  config: MasterConfig,
  field: MasterConfig['fields'][number],
  row: MasterRow,
) {
  const relation = field.name.endsWith('Id') ? row[field.name.slice(0, -2)] : undefined;
  const value =
    relation && typeof relation === 'object' && 'name' in relation
      ? (relation as { name: string }).name
      : row[field.name];
  if (config.resource === 'sales-channels' && field.name === 'inventoryMode')
    return inventoryModeLabel(value);
  if (field.type === 'attributes' && value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}：${item}`)
      .join('；');
  }
  return value == null || value === '' ? '—' : String(value);
}

function MasterDataDetails({ config, row }: { config: MasterConfig; row: MasterRow }) {
  return (
    <div className="master-data-details">
      {config.resource === 'products' ? <ProductThumbnail large row={row} /> : null}
      <dl className="record-detail-grid">
        {config.fields.map((field) => (
          <div key={field.name}>
            <dt>{field.label}</dt>
            <dd>{detailFieldValue(config, field, row)}</dd>
          </div>
        ))}
        <div>
          <dt>状态</dt>
          <dd>{row.status === 'ACTIVE' ? '正常' : '已停用'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function MasterDataPage() {
  const { resource = '' } = useParams();
  const config = masterConfigs[resource];
  const { params, keyword, setKeyword, setParam, setDateRange } = useListUrlState();
  const list = useMasterList(resource, params);
  const mutations = useMasterMutations(resource);
  const notify = useToast();
  const [editing, setEditing] = useState<MasterRow>();
  const [formOpen, setFormOpen] = useState(false);
  const [statusChanging, setStatusChanging] = useState<MasterRow>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const onSelectionChange = useCallback((ids: string[]) => setSelectedIds(ids), []);

  if (!config) return <Navigate replace to="/master/categories" />;
  const columns: DataTableColumn[] =
    config.resource === 'products'
      ? [
          {
            key: 'image',
            label: '图片',
            sortable: false,
            render: (row) => <ProductThumbnail row={row} />,
          },
          ...config.columns,
        ]
      : config.columns;

  const save = async (payload: Record<string, unknown>) => {
    if (editing) return mutations.update.mutateAsync({ id: editing.id, payload });
    return mutations.create.mutateAsync(payload);
  };

  const changeStatus = async (row: MasterRow) => {
    try {
      if (row.status === 'ACTIVE') await mutations.deactivate.mutateAsync(row.id);
      else await mutations.update.mutateAsync({ id: row.id, payload: { status: 'ACTIVE' } });
      notify(row.status === 'ACTIVE' ? '资料已停用' : '资料已启用', 'success');
      setStatusChanging(undefined);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };

  const bulkDeactivate = async () => {
    try {
      for (const id of selectedIds) await mutations.deactivate.mutateAsync(id);
      notify(`已停用 ${selectedIds.length} 条资料`, 'success');
      setSelectedIds([]);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };

  return (
    <section className="page-section">
      <header className="page-heading">
        <div>
          <span className="eyebrow">基础资料</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={17} /> 新增{config.title}
        </Button>
      </header>

      <div className="list-card">
        <div className="filter-bar">
          <label className="search-box">
            <Search aria-hidden size={17} />
            <Input
              aria-label="关键字搜索"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索代码或名称"
              value={keyword}
            />
          </label>
          <Select
            aria-label="状态筛选"
            onChange={(event) => setParam('status', event.target.value || undefined)}
            value={params.status ?? ''}
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">正常</option>
            <option value="INACTIVE">已停用</option>
          </Select>
          <DateRangePickerInput
            aria-label="创建日期范围"
            onChange={setDateRange}
            value={[params.createdFrom, params.createdTo]}
          />
          <Button
            onClick={() =>
              void exportMasterData(resource, params).catch((error) =>
                notify(apiErrorMessage(error), 'error'),
              )
            }
            variant="ghost"
          >
            <Download size={16} /> 导出 CSV
          </Button>
        </div>

        {selectedIds.length ? (
          <div className="bulk-bar">
            <span>已选择 {selectedIds.length} 条</span>
            <Button onClick={() => void bulkDeactivate()} variant="danger">
              <Power size={15} /> 批量停用
            </Button>
          </div>
        ) : null}

        <DataTable
          actions={(row) => (
            <>
              <button
                aria-label={`编辑 ${row.name}`}
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
                type="button"
              >
                <Pencil size={16} />
              </button>
              <button
                aria-label={`${row.status === 'ACTIVE' ? '停用' : '启用'} ${row.name}`}
                onClick={() => setStatusChanging(row)}
                type="button"
              >
                {row.status === 'ACTIVE' ? <Power size={16} /> : <RotateCcw size={16} />}
              </button>
            </>
          )}
          columns={columns.map((column) => ({
            ...column,
            render:
              config.resource === 'sales-channels' && column.key === 'inventoryMode'
                ? (row) => inventoryModeLabel(row.inventoryMode)
                : column.render,
            sortable: column.sortable ?? !column.key.includes('.'),
          }))}
          error={list.error ? apiErrorMessage(list.error) : undefined}
          loading={list.isLoading}
          meta={list.data?.meta}
          onPageChange={(page) => setParam('page', String(page), false)}
          onPageSizeChange={(size) => setParam('pageSize', String(size))}
          onSelectionChange={onSelectionChange}
          onSort={(key) => {
            setParam('sortBy', key);
            setParam(
              'sortOrder',
              params.sortBy === key && params.sortOrder === 'asc' ? 'desc' : 'asc',
            );
          }}
          rows={list.data?.data ?? []}
          renderDetail={(row) => <MasterDataDetails config={config} row={row} />}
          sortBy={params.sortBy}
          sortOrder={params.sortOrder}
        />
      </div>

      <MasterDataFormDialog
        config={config}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
        onSave={save}
        open={formOpen}
        pending={mutations.create.isPending || mutations.update.isPending}
        row={editing}
      />
      <DeactivateDialog
        action={statusChanging?.status === 'ACTIVE' ? 'deactivate' : 'activate'}
        name={statusChanging?.name ?? ''}
        onConfirm={() => changeStatus(statusChanging!)}
        onOpenChange={(open) => {
          if (!open) setStatusChanging(undefined);
        }}
        open={Boolean(statusChanging)}
        pending={mutations.deactivate.isPending || mutations.update.isPending}
      />
    </section>
  );
}
