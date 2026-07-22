# 05. 领域模型与边界

## 1. 主数据

```text
Category → Product → SKU
```

库存、采购、销售、退货均绑定 SKU，不绑定 Product。
未填写产品品牌时，统一按“无品牌”处理。
主数据业务代码可更正；关联关系始终使用内部 ID，代码变更必须保留审计记录。
SKU 属性以键值对录入并保存为对象，前端不要求手写 JSON。
SKU 重量统一以克（g）录入与保存。

## 2. 销售渠道与客户

SalesChannel 表示销售来源或运营渠道：

- AliExpress；
- 线下销售；
- 其他平台。

Customer 表示交易对手：

- 客户 A；
- 客户 B。

客户不能作为 SalesChannel。

销售记录允许：

- 有渠道无客户；
- 有客户且属于线下渠道；
- 平台订单通常有渠道，可无具体客户。

## 3. 采购渠道与供应商

PurchaseChannel 表示寻找或交易来源：

- 1688；
- 淘宝；
- 工厂直采；
- 线下。

Supplier 表示实际供货方。

Buyer 表示采购负责人，不是系统用户。

## 4. 渠道库存模式

SalesChannel 支持三种模式：

- `DIRECT_FROM_LOCATION`：从指定仓库直接销售；
- `EXTERNAL_WAREHOUSE`：货物实际进入平台仓；
- `VIRTUAL_ALLOCATION`：仍在物理仓，只分配渠道额度。

AliExpress 入仓 20 个必须使用外部渠道仓 Location
和库存调拨，不能只修改一个渠道数字。

## 5. 价格与成本

- SalesPrice：建议价；
- SalesOrderItem.unitPrice：成交快照；
- PurchasePrice：供应商报价；
- PurchaseOrderItem.unitPrice：采购成交快照；
- InventoryBalance.averageCost：当前移动平均成本；
- InventoryTransactionLine.unitCost：过账时成本快照。

## 6. 退货与质量

销售退货接收后先进入 `QC_PENDING`。

质检完成后分配至：

- AVAILABLE；
- DEFECTIVE；
- SUPPLIER_CLAIM；
- SCRAPPED。

供应商责任必须形成 QualityIssue，并可进入 SupplierClaim。

## 7. 批次追溯

移动平均成本不等于放弃批次追溯。

采购收货生成 InventoryBatch。

销售出库按 FIFO 分配批次用于来源追踪，但财务成本仍使用移动平均成本。

销售退货引用原销售出库项，由 BatchAllocation 追溯可能供应商。
