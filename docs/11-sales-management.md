# 11. 销售、渠道与客户

## 1. 页面

- 销售渠道；
- 客户；
- 销售价格；
- 销售订单；
- 销售出库；
- 销售退货；
- 应收查看。

## 2. 售价优先级

建议价格解析顺序：

1.  Customer 专属价；
2.  SalesChannel 渠道价；
3.  默认价；
4.  无价格时要求手工输入。

最终成交价必须保存在 SalesOrderItem，后续价格变化不影响历史。

## 3. 客户 A

客户 A 拿货 100 个、20 元/个：

- SalesChannel = 线下；
- Customer = 客户 A；
- SalesOrderItem.unitPrice = 20；
- SalesIssue 扣减指定仓库 100；
- 产生 Receivable 2000；
- 实际收款时产生 Receipt 和 FinancialTransaction。

## 4. 销售退货

退回 5 个损坏品：

- SalesReturn 引用原 SalesIssueItem；
- 接收后进入 QC_PENDING；
- 不直接冲回 AVAILABLE；
- 退款或冲减应收与实物质检可以分别进行，但必须关联同一 SalesReturn。

## 5. 已实现流程

### 售价解析

`GET /sales/prices/resolve` 按以下优先级解析有效价格：

1. 客户 + 当前渠道专属价；
2. 客户通用价；
3. 当前渠道价；
4. 默认价。

解析同时考虑起售量与生效区间。无有效价格时，订单要求手工输入成交价；最终单价只写入 `SalesOrderItem`，SKU 不保存价格。

### 渠道库存模式

- `DIRECT_FROM_LOCATION`：从渠道默认地点或明确指定的真实地点出库；
- `EXTERNAL_WAREHOUSE`：只能从关联该渠道的 `EXTERNAL_WAREHOUSE` 地点出库，库存余额是真实数量；
- `VIRTUAL_ALLOCATION`：在实际地点库存之上校验并消费渠道额度，不创建虚拟库存余额。

### 出库与退货

- 销售订单支持分批出库；
- 出库通过统一库存过账内核扣减 `AVAILABLE`，FIFO 只负责批次追溯，成本采用出库地点移动平均成本；
- 每次出库独立生成 `Receivable`；
- 销售退货引用原 `SalesIssueItem`，继承原成本和批次来源，并只增加待质检地点的 `QC_PENDING`；
- 退货金额先生成 `ReceivableAdjustment` 冲减未收应收，超出部分创建 `CustomerRefund`。

所有销售列表均支持服务端分页、搜索、渠道/客户/状态/日期筛选与排序，页面查询状态同步到 URL。
