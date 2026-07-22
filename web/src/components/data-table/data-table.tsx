import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { MasterRow, PageMeta } from '@/features/master-data/api';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';

export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: MasterRow) => ReactNode;
}

function deepValue(row: MasterRow, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[part];
    return undefined;
  }, row);
}

function displayValue(value: unknown): ReactNode {
  if (value == null || value === '') return <span className="muted">—</span>;
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'object' && item && 'purchaseChannel' in item
          ? String((item as { purchaseChannel: { name: string } }).purchaseChannel.name)
          : String(item),
      )
      .join('、');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(value),
    );
  }
  return String(value);
}

function detailValue(value: unknown): ReactNode {
  if (value == null || value === '') return <span className="muted">—</span>;
  if (Array.isArray(value))
    return value.length ? value.map(String).join('、') : <span className="muted">—</span>;
  if (typeof value === 'object') {
    return (
      <dl className="record-detail-nested">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
          <Fragment key={key}>
            <dt>{key}</dt>
            <dd>{detailValue(item)}</dd>
          </Fragment>
        ))}
      </dl>
    );
  }
  return displayValue(value);
}

export function DataTable({
  rows,
  columns,
  meta,
  loading,
  error,
  sortBy,
  sortOrder,
  onSort,
  onPageChange,
  onPageSizeChange,
  onSelectionChange,
  actions,
  onRowClick,
  activeRowId,
  renderExpandedRow,
}: {
  rows: MasterRow[];
  columns: DataTableColumn[];
  meta?: PageMeta;
  loading: boolean;
  error?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (key: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelectionChange?: (ids: string[]) => void;
  actions?: (row: MasterRow) => ReactNode;
  onRowClick?: (row: MasterRow) => void;
  activeRowId?: string;
  renderExpandedRow?: (row: MasterRow) => ReactNode;
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const tableColumns: ColumnDef<MasterRow>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          aria-label="选择当前页"
          checked={table.getIsAllPageRowsSelected()}
          className="table-checkbox"
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          type="checkbox"
        />
      ),
      cell: ({ row }) => (
        <input
          aria-label={`选择 ${row.original.name}`}
          checked={row.getIsSelected()}
          className="table-checkbox"
          onChange={row.getToggleSelectedHandler()}
          type="checkbox"
        />
      ),
      enableHiding: false,
    },
    ...columns.map<ColumnDef<MasterRow>>((column) => ({
      id: column.key,
      accessorFn: (row) => deepValue(row, column.key),
      header: () =>
        column.sortable === false ? (
          column.label
        ) : (
          <button className="table-sort" onClick={() => onSort(column.key)} type="button">
            {column.label}
            {sortBy === column.key ? (
              sortOrder === 'asc' ? (
                <ChevronUp size={13} />
              ) : (
                <ChevronDown size={13} />
              )
            ) : null}
          </button>
        ),
      cell: ({ row, getValue }) =>
        column.render ? (
          column.render(row.original)
        ) : column.key === 'status' ? (
          <span
            className={`status-pill ${getValue() === 'ACTIVE' ? 'status-active' : 'status-inactive'}`}
          >
            {getValue() === 'ACTIVE' ? '正常' : '已停用'}
          </span>
        ) : (
          displayValue(getValue())
        ),
    })),
    {
      id: 'actions',
      header: '操作',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="row-actions">
          <button
            aria-label={`查看 ${row.original.name}`}
            onClick={row.getToggleExpandedHandler()}
            type="button"
          >
            <Eye size={16} />
          </button>
          {actions?.(row.original)}
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    pageCount: meta?.totalPages ?? 0,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    state: { columnVisibility, expanded, rowSelection },
  });

  useEffect(() => {
    onSelectionChange?.(Object.keys(rowSelection).filter((id) => rowSelection[id]));
  }, [onSelectionChange, rowSelection]);

  const rowIds = rows.map((row) => row.id).join('\u0000');
  useEffect(() => {
    setRowSelection((current) => (Object.keys(current).length ? {} : current));
  }, [meta?.page, rowIds]);

  return (
    <div className="data-table-shell">
      <div className="table-utility-row">
        <span>共 {meta?.total ?? 0} 条数据</span>
        <details className="column-menu">
          <summary>
            <Columns3 size={15} /> 列设置
          </summary>
          <div>
            {table
              .getAllLeafColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <label key={column.id}>
                  <input
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                    type="checkbox"
                  />
                  {columns.find((item) => item.key === column.id)?.label ?? column.id}
                </label>
              ))}
          </div>
        </details>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }, (_, index) => (
                  <tr className="skeleton-row" key={index}>
                    {tableColumns.map((_, cell) => (
                      <td key={cell}>
                        <span />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      aria-selected={row.getIsSelected() || row.original.id === activeRowId}
                      className={
                        row.getIsSelected() || row.original.id === activeRowId
                          ? 'selected-row'
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        onRowClick(row.original);
                      }}
                      onClick={() => onRowClick?.(row.original)}
                      tabIndex={onRowClick ? 0 : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {row.getIsExpanded() ? (
                      <tr className="expanded-row">
                        <td colSpan={row.getVisibleCells().length}>
                          {renderExpandedRow ? (
                            renderExpandedRow(row.original)
                          ) : (
                            <dl className="record-detail-grid">
                              {Object.entries(row.original)
                                .filter(([key]) => key !== 'id')
                                .map(([key, value]) => (
                                  <div key={key}>
                                    <dt>{key}</dt>
                                    <dd>{detailValue(value)}</dd>
                                  </div>
                                ))}
                            </dl>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
          </tbody>
        </table>
        {!loading && error ? (
          <div className="table-state table-error">
            <RotateCcw aria-hidden />
            <strong>数据加载失败</strong>
            <span>{error}</span>
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <div className="table-state">
            <Eye aria-hidden />
            <strong>暂无数据</strong>
            <span>调整筛选条件，或创建第一条记录。</span>
          </div>
        ) : null}
      </div>

      <footer className="table-pagination">
        <label>
          每页显示
          <Select
            value={meta?.pageSize ?? 20}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
        <span>
          第 {meta?.page ?? 1} / {Math.max(meta?.totalPages ?? 0, 1)} 页
        </span>
        <Button
          disabled={!meta?.hasPreviousPage}
          onClick={() => onPageChange((meta?.page ?? 1) - 1)}
          variant="ghost"
        >
          <ChevronLeft size={15} /> 上一页
        </Button>
        <Button
          disabled={!meta?.hasNextPage}
          onClick={() => onPageChange((meta?.page ?? 1) + 1)}
          variant="ghost"
        >
          下一页 <ChevronRight size={15} />
        </Button>
      </footer>
    </div>
  );
}
