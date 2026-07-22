# 07. 分页、查询、筛选与导出

## 1. 统一列表参数

所有列表接口支持：

```text
page
pageSize
keyword
status
sortBy
sortOrder
createdFrom
createdTo
```

默认：

- page = 1
- pageSize = 20
- pageSize 可选 10 / 20 / 50 / 100
- sortOrder = desc

## 2. 统一返回

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0,
    "hasPreviousPage": false,
    "hasNextPage": false
  }
}
```

## 3. 服务端分页

TanStack Table 使用
`manualPagination: true`、`manualSorting: true`、`manualFiltering: true`。

前端不得拉取全部数据后分页。

## 4. 关键字查询

关键字采用模块白名单模糊查询。

例如：

- Category：code、name；
- Product：code、name、brand；
- SKU：code、name、productName；
- Supplier：code、name、contact；
- Buyer：code、name；
- Inventory：skuCode、productName、location；
- Finance：transactionNo、counterparty、remark。

## 5. 模块专用筛选

### 商品

- categoryId；
- productId；
- status；
- hasImage；
- created date。

### 库存

- categoryId；
- locationId；
- salesChannelId；
- skuId；
- stockStatus；
- lowStock；
- quantityMin/Max；
- updated date。

### 采购

- supplierId；
- buyerId；
- purchaseChannelId；
- documentStatus；
- order date；
- receipt date。

### 销售

- salesChannelId；
- customerId；
- documentStatus；
- sale date；
- amount range。

### 质量

- responsibility；
- supplierId；
- status；
- skuId；
- defect date。

### 财务

- accountId；
- direction；
- category；
- salesChannelId；
- supplierId；
- customerId；
- occurred date；
- amount range。

## 6. 排序

每个接口定义 sortBy 白名单，禁止把任意字段直接拼入 SQL。

## 7. 防抖

keyword 输入 300ms 防抖。

Select、日期和状态变更立即查询。

筛选变化后 page 重置为 1。

## 8. 导出

列表页支持：

- 导出当前筛选条件下全部结果；
- 导出当前页；
- 导出选中项。

第一版 CSV 必须实现；Excel 可作为增强。

大数据导出由后端流式生成，不能把全部数据加载到浏览器内存。

## 9. Phase 1 实现契约

- 主数据统一入口：`GET /api/v1/master-data/:resource`；
- CSV 入口：`GET /api/v1/master-data/:resource/export`；
- resource、keyword 字段、模块筛选字段和 sortBy 均使用服务端白名单；
- 创建时间采用 `createdFrom <= createdAt < createdTo` 半开区间；
- CSV 由服务端流式输出，并对 `= + - @` 开头的单元格增加前导单引号，避免表格公式注入；
- React 列表状态写入 URL，刷新、前进、后退和复制链接均可恢复查询；
- 当前页选择不跨页保留，避免在不可见数据上执行批量操作。

## 10. Phase 5 质量查询契约

- 待检退货、质检单、质量问题、供应商索赔、索赔处理、质量库存和供应商赔付全部由服务端分页；
- 质量查询支持 `keyword`、`supplierId`、`skuId`、`documentStatus`、`responsibility`、`resolutionType`、`createdFrom` 和 `createdTo`；
- 每个质量视图使用独立 `sortBy` 白名单，非法字段返回 422，不进入 Prisma 动态排序；
- 前端的视图、关键字、责任、处理方式、状态、日期、页码、页容量和排序全部同步到 URL；
- 质量分析支持日期、供应商与 SKU 过滤，不在浏览器中对分页列表二次聚合。

## 11. Phase 6 财务查询契约

- 财务列表支持 `month` 或 `createdFrom / createdTo`，以及账户、销售渠道、客户、供应商、采购渠道、采购员、资金方向和业务分类筛选；
- 账户、应付、应收、付款、收款、资金流水和调整单都使用独立服务端排序白名单；
- 月份、所有业务维度、分页、关键字和排序同步到 URL；
- 月度分析直接在服务端从资金、销售成本、质量损失和义务余额聚合，不对分页结果求和；
- 维度排行以真实入账/支出为口径，Supplier Credit 不进入现金维度排行。

## 12. Phase 7 文件查询契约

- `GET /files` 使用统一的 10/20/50/100 服务端分页；
- `keyword` 搜索 fileName、logicalPath 和 SHA-256；
- 支持 `provider`、`fileStatus`、`productId`、`module`、`entityType`、`entityId` 与创建时间筛选；
- `sortBy` 只允许 createdAt、updatedAt、fileName、size、status、provider 和 logicalPath；
- 文件中心视图、筛选、页码、页容量和排序同步 URL；
- `GET /files/export` 按当前筛选条件流式输出 CSV，并防止公式注入；
- 单个商品图库按明确 productId 查询，排序更新必须提交该商品全部、不重复的 imageIds。

## 13. Phase 8 备份查询契约

- `GET /backups` 使用统一的 10/20/50/100 服务端分页；
- `keyword` 搜索 backupNo、SHA-256 与 schemaVersion；
- 支持 `backupStatus`、`trigger`、`locked`、`createdFrom`、`createdTo` 筛选；
- `sortBy` 只允许 backupNo、status、trigger、size、startedAt、completedAt、verifiedAt、createdAt；
- 关键字、筛选、页码、页容量与排序全部同步到 URL；
- `GET /backups/export` 按当前服务端筛选流式输出 CSV，并执行公式注入防护；
- 恢复点详情的 Manifest 与关键记录计数来自 BackupHistory，不对分页结果二次聚合。
