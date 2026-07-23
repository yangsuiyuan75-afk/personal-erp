# 19. 实施计划

## Phase 0 --- 基础设施

- pnpm workspace；
- Docker PostgreSQL；
- Prisma；
- NestJS；
- Vite React；
- shadcn/ui Base UI；
- 全局错误、日志、Swagger；
- 测试环境。

## Phase 1 --- 统一 UI、认证和主数据

- 彩色设计 Token；
- Layout；
- DataTable；
- 分页查询；
- 登录；
- Category、Product、SKU、Unit；
- Supplier、Buyer、PurchaseChannel、SalesChannel、Customer。

## Phase 2 --- 库存中心

- Location；
- Balance；
- Transaction；
- Batch；
- Opening Inventory；
- Adjustment；
- Transfer；
- 平台仓。

## Phase 3 --- 采购

- Price；
- PO；
- Receipt；
- Return；
- Payable。

## Phase 4 --- 销售

- Sales Price；
- Sales Order；
- Sales Issue；
- Sales Return；
- Receivable。

## Phase 5 --- 质量与索赔

- QC；
- QualityIssue；
- SupplierClaim；
- Replacement；
- Compensation；
- Scrap。

## Phase 6 --- 财务

- Account；
- Payment；
- Receipt；
- Ledger；
- 月度分析。

## Phase 7 --- OneDrive

- MSAL；
- 设置向导；
- 供备份模块和产品图片使用的 FileAsset 与 StorageProvider；
- 不提供文件资产中心、通用附件、通用流式读取或重试接口。

## Phase 8 --- 备份与验收

- pg_dump；
- pg_restore；
- 启动补偿备份；
- Bootstrap Restore；
- E2E；
- 文档；
- 交付报告。
