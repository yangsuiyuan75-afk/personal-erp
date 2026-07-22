# 17. API 契约

## 1. 基础路径

```text
/api/v1
```

Swagger：

```text
/api/docs
```

## 2. 成功返回

详情：

```json
{
  "data": {},
  "requestId": "..."
}
```

列表：

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 120,
    "totalPages": 6,
    "hasPreviousPage": false,
    "hasNextPage": true
  },
  "requestId": "..."
}
```

## 3. 错误返回

```json
{
  "error": {
    "code": "INVENTORY_INSUFFICIENT",
    "message": "可用库存不足",
    "details": []
  },
  "requestId": "..."
}
```

## 4. HTTP 语义

- 200 查询或幂等重复成功；
- 201 创建；
- 204 删除/停用无响应；
- 400 校验错误；
- 401 未登录；
- 403 无权限；
- 404 不存在；
- 409 状态冲突、唯一冲突、幂等冲突；
- 422 业务规则不满足；
- 503 OneDrive/数据库外部依赖不可用。

## 5. 过账端点

示例：

```text
POST /purchase-receipts/{id}/post
POST /sales-issues/{id}/post
POST /quality-inspections/{id}/confirm
POST /supplier-claims/{id}/settlements
POST /payments/{id}/post
POST /receipts/{id}/post
```

必须接受 `Idempotency-Key`。

## 6. 文件 API

```text
POST   /files/upload
GET    /files/{id}
GET    /files/{id}/content
DELETE /files/{id}

POST   /onedrive/connect/start
GET    /onedrive/connect/status
POST   /onedrive/disconnect
GET    /onedrive/health
```

## 7. 备份 API

```text
GET   /backups/status
GET   /backups
GET   /backups/export
POST  /backups
GET   /backups/{id}/download
POST  /backups/{id}/verify
PATCH /backups/{id}/lock
POST  /backups/{id}/restore

GET   /bootstrap-recovery/status
POST  /bootstrap-recovery/restore
```

`POST /backups/{id}/restore` 要求当前密码与 `RESTORE <backupNo>`；
`POST /bootstrap-recovery/restore` 只在无 Schema/无管理员时开放，使用
`X-Recovery-Key` 和 `BOOTSTRAP RESTORE`，上传 PostgreSQL custom format `.dump`。

## 8. 认证 API

```text
GET   /auth/status
POST  /auth/bootstrap
POST  /auth/login
POST  /auth/refresh
POST  /auth/logout
PATCH /auth/password
```

`bootstrap` 只在尚未创建管理员时可用。`login`、`bootstrap`、`refresh` 返回短期 Access Token，并通过 HttpOnly Cookie 设置轮换用 Refresh Token。

## 9. 主数据与审计 API

```text
GET    /master-data/{resource}
GET    /master-data/{resource}/export
GET    /master-data/{resource}/{id}
POST   /master-data/{resource}
PATCH  /master-data/{resource}/{id}
DELETE /master-data/{resource}/{id}
GET    /audit-logs
```

`DELETE` 的业务语义是停用，不是物理删除。主数据代码创建后不可修改；SKU 请求白名单不接受售价、采购价或成本字段。

## 10. 库存 API

```text
GET    /inventory/locations
POST   /inventory/locations
PATCH  /inventory/locations/{id}
DELETE /inventory/locations/{id}
GET    /inventory/balances
GET    /inventory/transactions
GET    /inventory/transactions/{id}
GET    /inventory/batches

GET  /inventory/openings/template
POST /inventory/openings/preview
POST /inventory/openings/preview-file
GET  /inventory/openings
POST /inventory/openings
POST /inventory/openings/{id}/post

GET  /inventory/adjustments
POST /inventory/adjustments
POST /inventory/adjustments/{id}/post
GET  /inventory/transfers
POST /inventory/transfers
POST /inventory/transfers/{id}/post
POST /inventory/channel-allocations
```

期初、调整和调拨过账必须提供 `Idempotency-Key`。余额 API 只读，不提供 `PATCH` 或直接增减端点。

## 11. 采购 API

```text
GET   /purchase/prices
POST  /purchase/prices
PATCH /purchase/prices/{id}
GET   /purchase/orders
POST  /purchase/orders
POST  /purchase/orders/{id}/confirm
POST  /purchase/orders/{id}/cancel
GET   /purchase/receipts
POST  /purchase/receipts
POST  /purchase/receipts/{id}/post
GET   /purchase/returns
POST  /purchase/returns
POST  /purchase/returns/{id}/post
GET   /purchase/payables
GET   /purchase/supplier-credits
```

采购收货和采购退货过账必须提供 `Idempotency-Key`。订单明细的 `unitPrice` 是成交快照，不从 SKU 或当前报价回读。

## 12. 销售 API

```text
GET   /sales/prices
GET   /sales/prices/resolve
POST  /sales/prices
PATCH /sales/prices/{id}
GET   /sales/orders
POST  /sales/orders
POST  /sales/orders/{id}/confirm
POST  /sales/orders/{id}/cancel
GET   /sales/issues
POST  /sales/issues
POST  /sales/issues/{id}/post
GET   /sales/returns
POST  /sales/returns
POST  /sales/returns/{id}/post
GET   /sales/receivables
GET   /sales/customer-refunds
```

销售出库和销售退货过账必须提供 `Idempotency-Key`。销售退货接收地点必须为启用的 `QC_AREA`，库存状态固定为 `QC_PENDING`，API 不提供直接回到 `AVAILABLE` 的路径。

## 13. 质量与供应商索赔 API

```text
GET  /quality/pending-returns
GET  /quality/inspections
POST /quality/inspections
POST /quality/inspections/{id}/confirm
GET  /quality/issues
GET  /quality/claims
POST /quality/claims/{id}/settlements
GET  /quality/settlements
GET  /quality/stock
GET  /quality/compensation-receivables
GET  /quality/analytics
```

质检确认与供应商索赔处理必须提供 `Idempotency-Key`。质检确认按数量守恒把 `QC_PENDING` 分流至良品、不良品、供应商索赔或报废状态；换货处理不创建采购应付，现金赔付与下次抵扣分别创建赔付应收和 Supplier Credit。

## 14. 财务 API

```text
GET   /finance/accounts
POST  /finance/accounts
PATCH /finance/accounts/{id}
GET   /finance/payables
GET   /finance/receivables
GET   /finance/payments
POST  /finance/payments
POST  /finance/payments/{id}/post
GET   /finance/receipts
POST  /finance/receipts
POST  /finance/receipts/{id}/post
GET   /finance/adjustments
POST  /finance/adjustments
POST  /finance/adjustments/{id}/post
GET   /finance/transactions
GET   /finance/analytics
```

付款、收款和账户调整过账必须提供 `Idempotency-Key`。财务列表支持 `month`、`accountId`、`salesChannelId`、`customerId`、`supplierId`、`purchaseChannelId`、`buyerId`、`direction` 和 `category`。账户列表返回的 `balance` 是资金流水实时汇总值。

## 15. 文件与 OneDrive API

```text
GET    /files
GET    /files/export
POST   /files                              multipart: file + logicalPath
GET    /files/{id}
GET    /files/{id}/content
POST   /files/{id}/retry
DELETE /files/{id}

GET    /files/products/{productId}/images
POST   /files/products/{productId}/images multipart: files[] + isPrimary
PATCH  /files/products/{productId}/images/reorder
POST   /files/products/{productId}/images/{imageId}/primary
DELETE /files/products/{productId}/images/{imageId}

GET    /onedrive/status
POST   /onedrive/connect/start
DELETE /onedrive/connection
```

通用文件删除前检查 ProductImage 和 FileAssociation 引用；商品图片必须从商品图库删除。内容
接口由后端读取 Provider 并返回 Content-Type、ETag、Cache-Control 和 Content-Disposition。
OneDrive 状态及授权接口不得返回 Access Token、Refresh Token 或序列化 MSAL Cache。
