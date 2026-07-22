# Module Status

| Phase | Module                          | Status                             | Notes                                                                                    |
| ----: | ------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
|     0 | Workspace / Docker / PostgreSQL | COMPLETE                           | PostgreSQL 17 Alpine；本机 5434、测试库 5433；Migration `202607160001_phase0_foundation` |
|     0 | NestJS foundation               | COMPLETE                           | Health、Swagger、Pino、统一响应/错误、请求 ID；unit/integration/E2E 通过                 |
|     0 | React / shadcn Base UI          | COMPLETE                           | Vite React TS、Tailwind、Base UI、Iris tokens；unit/E2E/build 通过                       |
|     1 | Auth                            | COMPLETE                           | 单管理员初始化/登录/刷新轮换/退出；Argon2id、JWT、HttpOnly Cookie、审计                  |
|     1 | Unified DataTable & Query       | COMPLETE                           | 服务端分页/筛选/排序；URL 同步；列设置、批量选择、骨架/空/错状态、CSV                    |
|     1 | Master Data                     | COMPLETE                           | Category、Product、SKU、Unit、Supplier、Buyer、采购/销售渠道、Customer                   |
|     2 | Inventory                       | COMPLETE                           | 多地点/平台仓、余额/流水、移动平均、FIFO 批次、期初、调整、调拨、渠道额度                |
|     3 | Purchase                        | COMPLETE                           | 报价、采购订单/分批收货/退货、库存批次、应付调整与供应商退款应收                         |
|     4 | Sales                           | COMPLETE                           | 售价优先级、订单/分批出库、真实渠道仓/虚拟额度、应收、退货待检与客户退款                 |
|     5 | Quality & Supplier Claim        | COMPLETE                           | 退货质检守恒分流、质量库存、供应商索赔、换货/赔付/抵扣/报废及质量分析                    |
|     6 | Finance                         | COMPLETE                           | 资金账户、分配式收付款、真实资金流水、费用调整与多维月度经营分析                         |
|     7 | OneDrive & FileAsset            | WAITING_FOR_EXTERNAL_CONFIGURATION | 功能与模拟适配器已完成；真实连接仅待 `MICROSOFT_CLIENT_ID`                               |
|     8 | Backup & Restore                | COMPLETE                           | custom dump、SHA、OneDrive/Mock、PRE_RESTORE、分层保留、Bootstrap 与健康检查             |
|     8 | Final E2E & Acceptance          | COMPLETE                           | 全量门禁、完整迁移链、Bootstrap 恢复与 Product Design QA 全部通过                        |

## Phase 0 quality gate

- `pnpm lint`: passed
- `pnpm format:check`: passed after documentation update
- `pnpm typecheck`: passed
- `pnpm test`: passed (3 tests)
- `pnpm test:integration`: passed against PostgreSQL test container
- server E2E: passed
- `pnpm test:e2e`: passed (Chromium)
- `pnpm build`: passed (NestJS + Vite)
- `pnpm prisma:validate`: passed

Remaining Phase 0 risk: local port 5432 was already occupied, so this workspace's generated `.env` uses port 5434. `.env.example` keeps the documented configurable default 5432.

## Phase 1 quality gate

- `pnpm lint`: passed
- `pnpm format:check`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed（server 7 tests；web 1 test）
- `pnpm test:integration`: passed against PostgreSQL test container
- server E2E: passed（认证、主数据、CSV、审计）
- `pnpm test:e2e`: passed（Chromium；会话恢复、列表与 URL 查询同步）
- `pnpm build`: passed（NestJS + Vite）
- `pnpm prisma:validate`: passed

Phase 1 Migration：`202607160002_phase1_auth_master_data`。

## Phase 2 quality gate

- `pnpm lint`: passed
- `pnpm format:check`: passed
- `pnpm typecheck`: passed
- server unit: passed（库存 CSV 解析与既有单元测试）
- server integration: passed（期初幂等、移动平均成本、真实平台仓调拨、负库存保护）
- server E2E: passed（地点、期初预览/确认、余额、批次、调拨）
- web unit/build: passed
- web E2E: passed（数据优先库存工作台、URL 查询同步、SKU 上下文与批次追溯）
- Prisma validate/build: passed

Phase 2 Migration：`202607160003_phase2_inventory`。

## Phase 3 quality gate

- TypeScript、ESLint、Prettier、Nest build、Prisma validate：passed
- server integration：passed（报价区间、成交价快照、分批收货、移动成本、指定批次退货、已付款退款应收）
- server E2E：passed（采购订单确认、收货过账、应付、采购退货与应付冲减）
- web typecheck/lint/build：passed
- web E2E：passed（采购生命周期列表、状态、URL 查询同步、订单创建入口）

Phase 3 Migration：`202607160004_phase3_purchase`。

## Phase 4 quality gate

- TypeScript、ESLint、Prettier、Nest build、Vite build、Prisma validate：passed
- server integration：passed（售价优先级、成交快照、FIFO 出库、移动平均成本、渠道额度、退货待检与批次追溯）
- server E2E：passed（销售订单、出库过账、应收、销售退货与 `QC_PENDING`）
- web E2E：passed（销售生命周期、状态展示、URL 查询同步、订单创建入口）

Phase 4 Migration：`202607160005_phase4_sales`。

## Phase 5 quality gate

- TypeScript、ESLint、Prettier、Nest build、Vite build、Prisma validate：passed
- server integration：passed（质检数量与价值守恒、库存状态分流、换货无应付、现金赔付、下次抵扣、结案后幂等重放）
- server E2E：passed（待检退货、质检确认、质量问题、索赔、质量库存与赔付应收）
- web E2E：passed（质量工作台、右侧上下文、URL 查询同步和退货质检入口）

Phase 5 Migrations：`202607160006_phase5_quality`、`202607160007_phase5_settlement_status`、`202607160008_phase5_settlement_item`。

## Phase 6 quality gate

- TypeScript、ESLint、Prettier、Nest build、Vite build、Prisma validate：passed
- 完整迁移链：passed（临时空数据库从 Phase 0 顺序应用 10 个 Migration）
- server integration：passed（部分收付款、多目标分配、现金/抵扣分栏、赔付收款、账户余额与月度分析）
- server E2E：passed（账户、调整、付款、收款、资金流水、月度与业务维度查询）
- web E2E：passed（数据优先财务工作台、上下文栏、URL 查询、付款入口与月度分析）

Phase 6 Migrations：`202607160009_phase6_finance`、`202607160010_phase6_payable_credit`。

## Phase 7 quality gate

- TypeScript、ESLint、Prettier、Nest build、Vite build、Prisma validate：passed
- 完整迁移链：passed（临时空数据库从 Phase 0 顺序应用 11 个 Migration）
- server unit：passed（6 suites / 9 tests）
- server integration：passed（8 suites / 23 tests；含加密 MSAL 缓存、模拟存储、商品多图与文件查询）
- server E2E：passed（8 suites / 24 tests；含文件上传、内容访问、主图排序及 OneDrive 状态）
- web unit：passed
- web E2E：passed（7 tests；含文件中心、商品图库和 OneDrive 设置向导）
- 真实 OneDrive：`WAITING_FOR_EXTERNAL_CONFIGURATION`；未提供 `MICROSOFT_CLIENT_ID` 时由完整模拟适配器验收

Phase 7 Migration：`202607160011_phase7_files`。

## Phase 8 quality gate

- TypeScript、ESLint、Prettier、Nest build、Vite build、Prisma validate：passed
- 完整迁移链：passed（临时空数据库从 Phase 0 顺序应用 12 个 Migration，生成 70 张 public 表）
- server unit：passed（7 suites / 11 tests；含 7 日、4 周、12 月与锁定保留策略）
- web unit：passed（1 test）
- server integration：passed（9 suites / 26 tests；真实 `pg_dump -Fc`、SHA、FileService、真实 `pg_restore`、PRE_RESTORE、恢复后计数）
- server E2E：passed（9 suites / 27 tests；手工备份、分页筛选、校验、下载、锁定与恢复安全边界）
- web E2E：passed（9 tests；备份工作台、URL 查询、立即备份、密码/短语恢复与 Bootstrap 上传）
- 无数据库 Bootstrap：passed（临时数据库自动创建、custom dump 恢复、12 段迁移兼容检查、70 张表与健康检查）

Phase 8 Migration：`202607160012_phase8_backup`。

## Final acceptance gate

- Prettier、ESLint、TypeScript、Prisma validate：passed
- NestJS Build、Vite Build：passed
- unit：passed（server 7 suites / 11 tests；web 1 test）
- integration：passed（server 9 suites / 26 tests）
- server E2E：passed（9 suites / 27 tests）
- web E2E：passed（Chromium 9 tests）
- 完整迁移链：passed（12 个 Migration，70 张 public 表）
- Bootstrap 恢复：passed
- Product Design 视觉、交互、桌面/平板/移动端与深色模式 QA：passed（见 `design-qa.md`）
- 真实 OneDrive：`WAITING_FOR_EXTERNAL_CONFIGURATION`；不影响本地模拟 Provider 下的完整验收
