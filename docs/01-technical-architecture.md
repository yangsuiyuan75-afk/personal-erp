# 01. 技术架构

## 1. 总体结构

```text
Browser
  └─ React + Vite
       └─ Axios + TanStack Query
            └─ NestJS REST API
                 ├─ Prisma
                 ├─ PostgreSQL Docker
                 ├─ Microsoft Graph OneDrive
                 └─ pg_dump / pg_restore
```

## 2. Monorepo

```text
personal-erp/
├─ web/
├─ server/
├─ docs/
├─ blueprints/
├─ docker-compose.yml
├─ pnpm-workspace.yaml
└─ package.json
```

使用 pnpm workspace。

## 3. 前端依赖职责

- shadcn/ui Base UI：无障碍基础组件；
- Tailwind：样式；
- TanStack Query：服务端状态；
- Axios：HTTP；
- TanStack Table：表格状态；
- React Hook Form + Zod：表单；
- Zustand：仅 UI 偏好；
- ECharts：图表；
- Motion：轻量动效；
- lucide-react：图标。
- Ant Design `DatePicker`：仅用于日期/月选择。

## 4. 后端模块

```text
AuthModule
MasterDataModule
InventoryModule
PurchaseModule
SalesModule
QualityModule
FinanceModule
FileModule
OneDriveModule
BackupModule
AuditModule
HealthModule
```

## 5. 本地端口建议

- Web：5173
- API：3000
- PostgreSQL：5432

端口必须可以通过 `.env` 覆盖。

## 6. 时区与日期

- 数据库保存 UTC；
- API 使用 ISO 8601；
- UI 按本地时区显示；
- 日期范围查询采用半开区间 `[from, to)`，避免结束日漏数据。
