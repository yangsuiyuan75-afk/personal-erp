# 06. 数据库模型与约束

## 1. 精度

类型 PostgreSQL / Prisma

---

数量 Decimal(18,4)
单价与单位成本 Decimal(18,6)
金额 Decimal(30,4)
汇率 Decimal(18,8)

## 2. 核心枚举

### 主数据状态

`ACTIVE`、`INACTIVE`

### 库存状态

`AVAILABLE`、`QC_PENDING`、`DEFECTIVE`、`SUPPLIER_CLAIM`、`SCRAPPED`

### 渠道库存模式

`DIRECT_FROM_LOCATION`、`EXTERNAL_WAREHOUSE`、`VIRTUAL_ALLOCATION`

### 质量责任

`UNKNOWN`、`SUPPLIER`、`CUSTOMER`、`LOGISTICS`、`INTERNAL`

### 供应商处理

`REPLACEMENT`、`CASH_COMPENSATION`、`CREDIT_COMPENSATION`、`REJECTED`、`SELF_BEAR`、`SCRAP`

## 3. 主数据表

### Category

- id UUID
- code unique，可更正；关联关系使用内部 ID，代码变更保留审计记录
- name
- status
- createdAt
- updatedAt

### Product

- id
- code unique，可更正；关联关系使用内部 ID，代码变更保留审计记录
- categoryId
- name
- brand nullable
- description nullable
- status
- createdAt
- updatedAt

### SKU

- id
- code unique，可更正；关联关系使用内部 ID，代码变更保留审计记录
- barcode 可选；填写时全局唯一
- productId
- baseUnitId
- name
- attributes Json
- weight nullable，单位为 g
- status
- createdAt
- updatedAt

禁止 price、salePrice、costPrice 字段。

### Unit

- id
- code unique
- name
- decimalScale
- status

### Supplier

- id
- code unique
- name
- contactName
- phone
- taxNo
- purchaseChannelId nullable
- status

### Buyer

- id
- code unique
- name
- phone
- status

### PurchaseChannel

- id
- code unique
- name
- type
- status

Buyer 不关联 PurchaseChannel；采购订单分别保存采购员和采购渠道。Migration `202607220001_remove_buyer_purchase_channel` 删除已废弃的 `BuyerPurchaseChannel` 关联表。

### SalesChannel

- id
- code unique
- name
- inventoryMode
- defaultLocationId nullable
- status

### Customer

- id
- code unique
- name
- phone
- defaultSalesChannelId nullable
- status

## 4. 价格表

### SalesPrice

- skuId
- salesChannelId nullable
- customerId nullable
- currency
- price
- minQuantity
- effectiveFrom
- effectiveTo nullable
- status

业务约束：两者都为空表示默认价；客户价、渠道价与默认价按独立维度保存，同一维度有效区间不得冲突。

### PurchasePrice

- skuId
- supplierId
- buyerId nullable
- purchaseChannelId
- currency
- price
- minQuantity
- effectiveFrom
- effectiveTo nullable
- status

## 5. 库存表

### InventoryLocation

- id
- code unique
- name
- type
- parentId nullable
- salesChannelId nullable
- isLeaf
- status

只有叶子节点记账。

### InventoryBalance

唯一键：

```text
locationId + skuId + stockStatus
```

字段：

- onHandQuantity
- reservedQuantity
- averageCost
- inventoryValue
- version
- updatedAt

### InventoryTransaction

- transactionNo unique
- type
- occurredAt
- sourceType
- sourceId
- idempotencyKey unique
- reversedTransactionId nullable
- postedAt

### InventoryTransactionLine

- transactionId
- locationId
- skuId
- stockStatus
- quantity（有符号）
- unitCost
- amount
- remark

### InventoryBatch

- batchNo unique
- skuId
- supplierId nullable
- purchaseReceiptItemId nullable
- receivedQuantity
- remainingQuantity
- unitCost
- receivedAt

### InventoryBatchAllocation

- batchId
- transactionLineId
- quantity

### InventoryTransfer / InventoryTransferItem

记录物理仓、平台仓和质检仓之间的转移。

### ChannelAllocation / ChannelAllocationItem

仅用于 `VIRTUAL_ALLOCATION` 渠道额度，不改变物理库存。

Phase 2 已实现上述库存表，并增加以下约束：

- `InventoryBalance` 使用 `locationId + skuId + stockStatus` 复合主键；
- `InventoryTransaction.idempotencyKey`、各库存业务编号、批次号唯一；
- 期初、调整和调拨单保存 `transactionId`，过账后只允许通过反向或新业务单修正；
- `InventoryLocation` 支持父子层级及销售渠道关联，只有启用叶子地点允许记账；
- `IdempotencyRecord` 使用 `scope + key` 唯一键，避免不同过账域之间互相占用幂等键；
- Phase 2 Migration：`202607160003_phase2_inventory`。

## 6. 采购表

- PurchaseOrder
- PurchaseOrderItem
- PurchaseReceipt
- PurchaseReceiptItem
- PurchaseReturn
- PurchaseReturnItem

采购单头保存 buyer、supplier、purchaseChannel。

采购明细保存 unitPrice 快照。

采购收货过账：

1.  增加 InventoryBalance；
2.  计算移动平均成本；
3.  创建 InventoryBatch；
4.  生成 Payable；
5.  生成库存流水。

Phase 3 实际模型同时包含：

- `PurchasePrice`：SKU、供应商、采购渠道、采购员、起订量和生效区间；
- `PurchaseOrder / PurchaseOrderItem`：订单明细保存 `unitPrice` 与 `lineAmount` 成交快照，并累计收货/退货量；
- `PurchaseReceipt / PurchaseReceiptItem`：支持分批收货，每个收货明细保存独立批次号；
- `PurchaseReturn / PurchaseReturnItem`：引用原收货明细和原批次；
- `Payable / PayableAdjustment`：收货生成应付，未付款退货以调整记录冲减；
- `SupplierCredit`：退货金额超过未付余额时保存供应商退款应收或后续抵扣额度。

Phase 3 Migration：`202607160004_phase3_purchase`。

## 7. 销售表

- SalesOrder
- SalesOrderItem
- SalesIssue
- SalesIssueItem
- SalesReturn
- SalesReturnItem

销售明细保存 unitPrice 快照。

SalesIssueItem 保存：

- unitCost；
- costAmount；
- transactionLineId，用于关联出库地点、移动平均成本快照和 FIFO 批次分配。

Phase 4 实际模型同时包含：

- `SalesPrice`：支持客户专属价、渠道价和默认价，按起售量及生效区间解析；
- `SalesOrder / SalesOrderItem`：客户与渠道独立引用，订单明细保存 `unitPrice` 和金额快照；
- `SalesIssue / SalesIssueItem`：支持分批出库，保存收入、移动平均单位成本、成本金额及库存流水行；创建销售订单时按订单明细预创建草稿出库单，草稿可暂不指定 `locationId`，过账前必须补齐；
- `SalesReturn / SalesReturnItem`：必须引用原出库明细，实物接收固定进入 `QC_PENDING`；
- `SalesReturnBatchTrace`：延续原出库的 FIFO 批次来源，不在质检前增加可售批次数量；
- `Receivable / ReceivableAdjustment`：出库生成应收，退货先冲减未收余额；
- `CustomerRefund`：退货金额超过应收未收余额时形成待退款；
- `ChannelAllocationItem.consumedQuantity`：虚拟渠道额度消费量；平台仓仍使用真实 `InventoryLocation` 和真实库存余额。

Phase 4 Migration：`202607160005_phase4_sales`。

## 8. 质量表

### QualityInspection

- inspectionNo
- salesReturnId
- status
- inspectedAt
- notes
- confirmedAt

### QualityInspectionItem

- salesReturnItemId
- goodQuantity
- defectiveQuantity
- supplierClaimQuantity
- scrapQuantity
- responsibility
- supplierId nullable
- defectDescription
- estimatedLoss

数量总和必须等于接收退货数量。

### QualityInventoryMovement

连接质检单与确认质检时生成的库存流水。质检确认通过统一库存过账内核，把
`QC_PENDING` 数量守恒地分流至 `AVAILABLE`、`DEFECTIVE`、
`SUPPLIER_CLAIM` 或 `SCRAPPED`。

### QualityIssue

- issueNo
- skuId
- qualityInspectionItemId
- supplierId nullable
- responsibility
- quantity
- estimatedLoss
- status
- defectDescription

### SupplierClaim

- claimNo
- supplierId
- status
- claimedAmount
- settledAmount
- submittedAt

### SupplierClaimItem

- supplierClaimId
- qualityIssueId
- quantity
- claimAmount

### SupplierClaimSettlement

- settlementNo
- supplierClaimId
- supplierClaimItemId nullable
- resolutionType
- status
- quantity nullable
- amount nullable
- replacementLocationId nullable
- claimStockLocationId nullable
- scrapLocationId nullable
- disposeQuantity nullable
- batchNo nullable
- occurredAt
- inventoryTransactionId nullable
- postedAt nullable

换货和报废结算产生库存流水；现金赔付产生
`SupplierCompensationReceivable`；下次抵扣产生 `SupplierCredit`。换货不产生
新的采购应付，也不伪造资金流水。

### SupplierCompensationReceivable

- receivableNo
- supplierId
- supplierClaimSettlementId
- originalAmount
- receivedAmount
- outstandingAmount
- status
- occurredAt

Phase 5 Migrations：

- `202607160006_phase5_quality`；
- `202607160007_phase5_settlement_status`；
- `202607160008_phase5_settlement_item`。

## 9. 财务表

- `FinancialAccount`：账户代码、名称、类型、币种和启停状态；不保存可手工覆盖的余额；
- `Payable`：新增 `creditedAmount`，把真实现金付款与 Supplier Credit 抵扣分开；
- `Receivable`：保存原始、调整、实收和未收金额；
- `Payment / PaymentAllocation`：付款单可分配多个同类应付或客户退款；应付分配可同时使用 Supplier Credit；
- `Receipt / ReceiptAllocation`：收款单可分配多个销售应收或多个供应商赔付应收，但同一收款单不得混用两类；
- `AccountAdjustment`：账户期初、平台费、物流费、其他收支和账户修正；日常开销账单复用该过账内核，并通过 `expenseCategory` 与 `payee` 保存账单分类和收款方；
- `FinancialTransaction`：保存资金账户、流入/流出、业务分类、金额、来源单据及销售渠道、客户、供应商、采购渠道、采购员维度快照。

FinancialTransaction 是真实资金流水，不等同于应收应付。

所有付款和收款必须生成 FinancialTransaction。

账户余额定义为：

```text
已过账 FinancialTransaction 流入合计 - 已过账 FinancialTransaction 流出合计
```

数据库不提供直接覆盖账户余额的字段。Supplier Credit 只更新 `Payable.creditedAmount` 和信用余额，不增加 `FinancialTransaction` 支出。

Phase 6 Migrations：

- `202607160009_phase6_finance`；
- `202607160010_phase6_payable_credit`。

日常开销扩展 Migration：`202607220002_daily_expense_bills`，新增 `ExpenseCategory` 及 `AccountAdjustment.expenseCategory / payee`。日常开销过账后以 `EXPENSE_BILL` 来源生成 `OTHER_EXPENSE` 资金流水。

## 10. 文件与备份

### FileAsset

- 仅供备份模块、ProductImage 和内部 StorageProvider 使用；不提供通用浏览器文件资产接口；
- id UUID
- provider：`ONEDRIVE` 或 `MOCK_LOCAL`
- driveId
- itemId，和 provider、driveId 组成唯一远端对象约束
- parentItemId nullable
- logicalPath
- fileName
- mimeType
- size Int
- sha256（SHA-256 十六进制）
- eTag nullable
- status：`PENDING`、`UPLOADING`、`SYNCED`、`FAILED`、`DELETED`
- lastError nullable
- createdAt
- updatedAt

### ProductImage

- productId
- fileAssetId unique
- isPrimary
- sortOrder

产品图片通过 FileService 和 StorageProvider 上传；每个 Product 最多 12 张，第一张默认为主图。数据库只保存 FileAsset 关联和排序元数据，不保存图片 URL、绝对路径或二进制。

### FileAssociation

保留给内部备份文件关联，保存 fileAssetId、module、entityType、entityId 和可选 label；
`fileAssetId + module + entityType + entityId` 唯一。不再作为业务附件 API。

Phase 7 Migration：`202607160011_phase7_files`。

### BackupHistory

- backupNo unique；
- fileAssetId nullable/unique，关联已上传的 `.dump` FileAsset；
- createdById nullable，启动补偿等系统任务允许无用户；
- status：`CREATING`、`UPLOADING`、`VERIFIED`、`FAILED`、`EXPIRED`；
- format：`POSTGRES_CUSTOM`；
- trigger：`MANUAL`、`STARTUP_COMPENSATION`、`OPERATION_THRESHOLD`、`PRE_RESTORE`、`BOOTSTRAP_IMPORT`；
- schemaVersion、appVersion、postgresVersion；
- sha256、size BigInt；
- manifest Json，保存 catalogEntries 与关键表 recordCounts；
- locked、localAvailable；
- startedAt、completedAt、verifiedAt、cloudUploadedAt、restoredAt；
- errorMessage nullable。

备份文件仍通过 `FileAsset -> StorageProvider` 管理；数据库不保存绝对路径或 dump 二进制。
本地独立恢复副本以 backupNo 推导路径，因此可在 FileAsset 不可用时下载或恢复。

Phase 8 Migration：`202607160012_phase8_backup`。

## 11. 基础设施表

### SystemSetting

- key unique；
- value Json；
- updatedAt。

Phase 0 Migration：`202607160001_phase0_foundation`。

### AdminUser

- username unique；
- passwordHash（Argon2id）；
- passwordChangedAt；
- lastLoginAt nullable；
- 单用户约束由初始化事务与 PostgreSQL advisory lock 保证。

### RefreshSession

- adminUserId；
- tokenHash unique，只保存不透明 Refresh Token 的 SHA-256；
- expiresAt、revokedAt、replacedById；
- userAgent、ipAddress nullable。

### AuditLog

- module、action、entityType、entityId nullable；
- actorId、requestId、result；
- before/after Json，写入前递归移除密码、Token、Cookie 等敏感字段；
- 只追加，不提供普通删除。

### IdempotencyRecord

- key + scope 唯一；
- requestHash、response Json、statusCode、expiresAt；
- 供后续库存与财务过账复用。

Phase 1 Migration：`202607160002_phase1_auth_master_data`，包含认证、审计、幂等与全部 Phase 1 主数据表及索引。

## 12. 通用约束

- 外键默认 RESTRICT；
- 禁止 Cascade 删除业务数据；
- 业务编号唯一；
- barcode 可选；填写时唯一；
- 金额和数量不得为 NaN；
- posted 单据禁止修改；
- 常用查询建立组合索引；
- 日期查询索引包含 occurredAt/createdAt；
- 列表排序字段必须白名单。
