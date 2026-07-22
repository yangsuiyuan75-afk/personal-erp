# 09. 库存中心

## 1. 核心页面

- 库存工作台；
- 库存余额；
- 库存流水；
- 期初库存；
- 库存调整；
- 仓库调拨；
- 平台仓入仓/退仓；
- 批次追溯；
- 库位管理。

## 2. 可用量

```text
availableQuantity = onHandQuantity - reservedQuantity
```

系统禁止负可用库存。

## 3. 移动平均成本

采购入库、供应商补货等增加可售库存时更新移动平均成本。

供应商免费补发可根据政策选择：

- 0 成本入库并重新平均；
- 继承被索赔商品原批次成本。

第一版默认继承原质量问题对应成本，避免成本被不合理稀释。

## 4. AliExpress 平台仓

如果 AliExpress 为 `EXTERNAL_WAREHOUSE`：

1.  为 AliExpress 建立外部仓 Location；
2.  主仓入仓 20 个 = InventoryTransfer；
3.  主仓 -20；
4.  AliExpress 仓 +20；
5.  售出 10 个从 AliExpress 仓扣减；
6.  平台退仓回到本地 QC Location，不直接回主仓 AVAILABLE。

## 5. 期初库存

支持：

- CSV 模板下载；
- 上传预览；
- 行级校验；
- 重复导入幂等；
- 一次性确认；
- 生成 `OPENING_IN` 流水；
- 保存初始成本。

## 6. 反向与修正

已过账流水不可修改。

错误使用：

- 反向流水；
- 退货；
- 调整单。

渠道销售、退货和质量处理不得使用通用反向绕过业务流程。

## 7. Phase 2 实现结果

- 所有余额变化统一经过 `InventoryPostingService`，Controller 和普通 CRUD 不提供余额修改入口；
- 过账使用 PostgreSQL `Serializable` 事务，遇到 Prisma `P2034` 有限重试；
- `Idempotency-Key` 按业务单据作用域保存请求 SHA-256 与响应，相同内容直接返回原流水，不同内容返回冲突；
- 入库按“原库存金额 + 本次金额 / 新数量”更新移动平均成本，出库保存当前移动平均成本快照；
- 可用量不足时整笔事务回滚，禁止负库存；
- 可售出库按批次接收时间 FIFO 创建 `InventoryBatchAllocation`，成本仍使用移动平均；
- 外部平台仓必须是关联 `EXTERNAL_WAREHOUSE` 销售渠道的真实 `InventoryLocation`；
- `VIRTUAL_ALLOCATION` 渠道使用 `ChannelAllocation`，额度不得超过物理地点可用库存，且不改变物理余额；
- 期初库存提供 UTF-8 CSV 模板、文件预览、逐行错误、重复导入幂等与一次性确认；
- 库存工作台采用用户选定的数据优先布局：余额表为主工作面，选中 SKU 后在右侧显示地点分布、成本和批次。
