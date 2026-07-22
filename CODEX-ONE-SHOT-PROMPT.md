# Codex 一次性实施任务

请完整阅读根目录 `AGENTS.md`、`README-FIRST.md`、`docs/` 全部文档和
`blueprints/` 全部文件。

你的任务是从空项目或当前项目状态开始，按文档实现一套可以本地使用的
Personal ERP。

## 执行方式

这是一次性委托，但必须内部按以下阶段串行执行：

1.  Phase 0：工作区、Docker PostgreSQL、NestJS、React Vite、基础规范；
2.  Phase 1：认证、主数据、统一 UI、统一分页查询；
3.  Phase 2：库存中心与期初库存；
4.  Phase 3：采购渠道、供应商、采购员、采购与收货；
5.  Phase 4：销售渠道、客户、销售出库与渠道仓；
6.  Phase 5：退货、质检、供应商换货/赔付；
7.  Phase 6：财务账户、应收应付、收付款与月度分析；
8.  Phase 7：Microsoft Graph OneDrive、文件中心、商品图片；
9.  Phase 8：数据库一键备份恢复、完整验收和文档收尾。

每阶段必须测试通过再进入下一阶段。发现外部凭据缺失时，不要停止整个项目：实现完整功能、模拟适配器和设置向导，将该项标记为
`WAITING_FOR_EXTERNAL_CONFIGURATION`，继续其他阶段。

## 必须完整实现

- 服务端分页、搜索、筛选、排序；
- 页面查询条件同步到 URL；
- Category、Product、SKU；
- Unit；
- Supplier、Buyer、PurchaseChannel；
- SalesChannel、Customer；
- 多库存地点与渠道仓；
- 库存余额、流水、移动平均成本、批次追溯；
- 采购订单、采购收货、采购退货；
- 销售订单、销售出库、销售退货；
- 待质检、不良品、供应商索赔、换货、赔付、报废；
- 财务账户、应收、应付、收款、付款、资金流水；
- 按月份、销售渠道、客户、供应商、采购渠道、采购员查询；
- FileAsset；
- 商品多图、主图、排序、删除；
- Microsoft Graph OneDrive Personal；
- OneDrive 首次连接与重新授权向导；
- PostgreSQL 一键备份、启动补偿备份、一键恢复；
- Swagger；
- 审计日志；
- 中文 UI；
- 统一彩色 SaaS 视觉；
- 深色模式和跟随系统，但默认浅色；
- 完整测试。

## OneDrive 外部配置

使用 Microsoft Graph delegated permissions：

- `User.Read`
- `Files.ReadWrite`
- `offline_access`

优先采用 `@azure/msal-node` 公共客户端 Device Code Flow，authority 使用
`consumers`，避免依赖固定企业租户和 Client Secret。

需要用户提供：

```env
MICROSOFT_CLIENT_ID=
```

设置页必须展示：

- 未配置 Client ID；
- 未连接；
- 正在授权；
- 已连接；
- Token 需要重新授权；
- Graph 不可达；
- OneDrive 空间不足。

## 禁止

- 不得把售价或成本价放进 SKU；
- 不得把 Customer 当作 SalesChannel；
- 不得把 AliExpress 平台仓简单当成虚拟数量；
- 不得让销售退货直接回到可售库存；
- 不得直接改库存余额；
- 不得把图片放数据库；
- 不得把 Token 明文放数据库；
- 不得只生成占位页面或 TODO；
- 不得在测试失败时声称完成。

## 最终交付

完成后：

1.  运行全部质量检查；
2.  更新 `docs/module-status.md`；
3.  更新 `docs/decisions.md`；
4.  创建根目录 `IMPLEMENTATION-REPORT.md`；
5.  列出仍需用户完成的外部配置；
6.  提供从零启动、连接
    OneDrive、创建管理员、导入期初库存、备份与恢复的步骤。
