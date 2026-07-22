import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { DataTable } from '@/components/data-table/data-table';
import { Input, Select } from '@/components/ui/field';
import { apiClient } from '@/lib/axios/client';
import { apiErrorMessage } from '@/lib/api-error';
import type { MasterListResponse, MasterRow } from '@/features/master-data/api';
import { useListUrlState } from '@/features/master-data/use-list-url-state';

async function listAudit(params: Record<string, unknown>): Promise<MasterListResponse> {
  const response = await apiClient.get<MasterListResponse>('/audit-logs', { params });
  return {
    ...response.data,
    data: response.data.data.map((row) => ({
      ...row,
      code: String(row.action),
      name: String(row.entityType),
      status: 'ACTIVE',
    })) as MasterRow[],
  };
}

export function AuditPage() {
  const { params, keyword, setKeyword, setParam } = useListUrlState();
  const query = useQuery({ queryKey: ['audit', params], queryFn: () => listAudit(params) });
  return (
    <section className="page-section">
      <header className="page-heading">
        <div>
          <span className="eyebrow">系统设置</span>
          <h1>审计日志</h1>
          <p>关键业务操作只追加记录，不允许普通删除。</p>
        </div>
      </header>
      <div className="list-card">
        <div className="filter-bar">
          <label className="search-box">
            <Search size={17} />
            <Input
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="实体 ID 或请求 ID"
              value={keyword}
            />
          </label>
          <Select onChange={(event) => setParam('module', event.target.value || undefined)}>
            <option value="">全部模块</option>
            <option value="AUTH">认证</option>
            <option value="MASTER_DATA">基础资料</option>
          </Select>
        </div>
        <DataTable
          columns={[
            { key: 'module', label: '模块', sortable: false },
            { key: 'action', label: '操作', sortable: false },
            { key: 'entityType', label: '实体', sortable: false },
            { key: 'entityId', label: '实体 ID', sortable: false },
            { key: 'result', label: '结果', sortable: false },
            { key: 'createdAt', label: '时间' },
          ]}
          error={query.error ? apiErrorMessage(query.error) : undefined}
          loading={query.isLoading}
          meta={query.data?.meta}
          onPageChange={(page) => setParam('page', String(page), false)}
          onPageSizeChange={(size) => setParam('pageSize', String(size))}
          onSort={(key) => setParam('sortBy', key)}
          rows={query.data?.data ?? []}
          sortBy={params.sortBy}
          sortOrder={params.sortOrder}
        />
      </div>
    </section>
  );
}
