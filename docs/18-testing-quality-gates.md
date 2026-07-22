# 18. 测试与质量门槛

## 1. 单元测试

必须覆盖：

- 移动平均成本；
- 库存不足；
- 分批收货；
- 幂等重复提交；
- 售价优先级；
- 退货数量上限；
- 质检数量守恒；
- 供应商赔付；
- 应收应付分配；
- 备份保留策略；
- 查询参数解析。

## 2. 集成测试

使用测试 PostgreSQL。

核心流程：

1.  创建主数据；
2.  采购收货；
3.  库存增加；
4.  平台仓调拨；
5.  销售出库；
6.  销售退货；
7.  质检；
8.  供应商换货；
9.  财务赔付；
10. 月度查询。

## 3. OneDrive 测试

提供：

- `InMemoryStorageProvider`；
- `LocalTestStorageProvider`；
- OneDrive Provider 契约测试；
- 可选真实 Graph smoke test，默认不在 CI 运行。

## 4. E2E

Playwright 覆盖：

- 登录；
- 新建 Product/SKU；
- 列表搜索与分页；
- 上传商品图；
- 采购收货；
- 渠道仓入仓；
- 退货质检；
- 财务收款；
- 手工备份。

## 5. 构建门槛

所有命令通过后才能标记完成：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm prisma:validate
```
