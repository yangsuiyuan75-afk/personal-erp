# Personal ERP Implementation Report

完成日期：2026-07-16  
本地交付状态：`COMPLETE`  
外部服务状态：OneDrive Personal `WAITING_FOR_EXTERNAL_CONFIGURATION`

## 1. 阶段交付

| Phase | 交付内容                                                                       | 状态                               |
| ----: | ------------------------------------------------------------------------------ | ---------------------------------- |
|     0 | pnpm workspace、Docker PostgreSQL、NestJS、React Vite、Swagger、日志与基础规范 | COMPLETE                           |
|     1 | 单管理员认证、审计、主数据、统一 DataTable、服务端查询与 URL 同步              | COMPLETE                           |
|     2 | 多地点库存、渠道仓、余额/流水、移动平均、FIFO 批次、期初/调整/调拨             | COMPLETE                           |
|     3 | 采购渠道、供应商、采购员、报价、采购订单、分批收货与采购退货                   | COMPLETE                           |
|     4 | 销售渠道、客户、价格规则、销售订单、分批出库、渠道仓与销售退货                 | COMPLETE                           |
|     5 | 待质检、不良品、供应商索赔、换货、赔付、抵扣与报废                             | COMPLETE                           |
|     6 | 财务账户、应收应付、收付款、资金流水与多维月度分析                             | COMPLETE                           |
|     7 | FileAsset、商品多图、OneDrive 设置向导、Graph 适配器与模拟 Provider            | WAITING_FOR_EXTERNAL_CONFIGURATION |
|     8 | custom dump、校验、启动补偿备份、PRE_RESTORE、Bootstrap 恢复与完整验收         | COMPLETE                           |

Phase 7 的代码、模拟适配器和全部本地测试已完成；只有真实 Microsoft 账户授权需要用户提供外部配置。

## 2. 已交付能力

- 统一的服务端分页、关键词搜索、字段筛选、白名单排序和 CSV 导出；页面查询状态同步到 URL。
- Category、Product、SKU、Unit、Supplier、Buyer、PurchaseChannel、SalesChannel、Customer 完整主数据。
- 多库存地点与真实渠道仓；库存余额只由业务单据、`InventoryTransaction` 和明细过账生成。
- 移动平均成本、FIFO 批次追溯、期初库存、库存调整、调拨、采购与销售全生命周期。
- 销售退货先进入 `QC_PENDING`；质量结果守恒分流到可售、不良、索赔或报废库存。
- 财务账户、应收、应付、分配式收付款、资金流水及按月、销售渠道、客户、供应商、采购渠道、采购员分析。
- FileAsset 文件中心、商品多图、主图、排序、删除；数据库只存元数据，不存图片二进制。
- Microsoft Graph delegated Device Code Flow、加密 MSAL 持久缓存、首次连接/重新授权向导及完整状态机。
- PostgreSQL custom-format 备份、SHA-256、分层保留、启动补偿、锁定恢复点、PRE_RESTORE 与无数据库 Bootstrap 恢复。
- Swagger、Pino、统一错误响应、请求 ID、审计日志、中文彩色 SaaS UI、默认浅色/深色/跟随系统。

## 3. 关键业务约束

- SKU 不保存售价、成本价或当前采购价；价格、成交快照与库存成本独立管理。
- Customer 与 SalesChannel 独立建模。
- AliExpress 等平台仓是实际库存地点，不使用虚拟数量冒充仓库库存。
- 已过账单据不可直接修改或物理删除；关键过账具有唯一幂等键并在事务中完成。
- 销售退货不会直接增加可售库存，必须经过质检。
- 业务模块不直接修改库存余额，也不直接调用 Microsoft Graph。
- Token 不明文进入数据库或 `.env`；文件二进制和本地绝对业务路径不进入 PostgreSQL。

## 4. 数据库与 Migration

Prisma Migration 共 12 个，已从空数据库按顺序验证并生成 70 张 `public` 表：

1. `202607160001_phase0_foundation`
2. `202607160002_phase1_auth_master_data`
3. `202607160003_phase2_inventory`
4. `202607160004_phase3_purchase`
5. `202607160005_phase4_sales`
6. `202607160006_phase5_quality`
7. `202607160007_phase5_settlement_status`
8. `202607160008_phase5_settlement_item`
9. `202607160009_phase6_finance`
10. `202607160010_phase6_payable_credit`
11. `202607160011_phase7_files`
12. `202607160012_phase8_backup`

## 5. 最终质量门禁

| 检查                | 结果                                                   |
| ------------------- | ------------------------------------------------------ |
| Prettier            | passed                                                 |
| ESLint              | passed                                                 |
| TypeScript          | passed                                                 |
| Prisma validate     | passed                                                 |
| NestJS + Vite Build | passed                                                 |
| unit                | passed：server 7 suites / 11 tests；web 1 test         |
| integration         | passed：server 9 suites / 26 tests                     |
| server E2E          | passed：9 suites / 27 tests                            |
| web E2E             | passed：Chromium 9 tests                               |
| 空库完整迁移链      | passed：12 Migrations / 70 tables                      |
| Bootstrap 恢复      | passed                                                 |
| Product Design QA   | passed：视觉、交互、桌面/平板/移动端、深色模式与控制台 |

Vite Build 仅有约 773 kB 主 chunk 的非阻塞体积提示，不影响本地使用或验收。

## 6. 仍需用户完成的外部配置

1. 注册支持个人 Microsoft 账户的公共客户端应用。
2. 开启公共客户端流，并配置 delegated permissions：`User.Read`、`Files.ReadWrite`、`offline_access`。
3. 将 Application (client) ID 写入 `MICROSOFT_CLIENT_ID`，不创建 Client Secret。
4. 首次连接或 Token 失效时，由用户本人完成 Device Code 授权。
5. 确认 OneDrive 有足够空间。

完成配置前，文件与备份使用完整本地模拟 Provider，其他模块不受影响。

## 7. 从零使用

完整命令与操作步骤见 `README-FIRST.md`。最短路径如下：

```powershell
Copy-Item .env.example .env
pnpm install
docker compose up -d postgres
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

然后打开 <http://localhost:5173> 创建唯一管理员；在商品中心建立主数据和 SKU，在库存中心建立地点，再从“业务操作 → 期初库存”下载模板、预检并确认导入。

OneDrive 在“文件中心 → OneDrive 设置”完成 Device Code 连接。常规备份与登录后恢复在“系统 → 备份恢复”执行；数据库不存在时使用：

```powershell
pnpm backup:bootstrap-restore -- `
  -BackupPath C:\Backups\BKP-20260716.dump `
  -ConfirmPhrase "BOOTSTRAP RESTORE personal_erp" `
  -DatabaseUrl "postgresql://personal_erp:密码@localhost:5432/personal_erp?schema=public"
```

详细验收状态见 `docs/module-status.md`；视觉验收见 `design-qa.md`；重要设计决策见 `docs/decisions.md`。
