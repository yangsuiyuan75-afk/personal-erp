# Personal ERP --- Codex 开发守则

## 1. 最高优先级

本文件与 `docs/` 是项目的唯一设计依据。

开始任何任务前必须阅读：

- `docs/00-product-scope.md`
- `docs/01-technical-architecture.md`
- `docs/02-ui-design-system.md`
- `docs/03-frontend-architecture.md`
- `docs/04-backend-architecture.md`
- `docs/05-domain-model.md`
- 当前任务相关业务文档
- `docs/module-status.md`
- `docs/decisions.md`

设计与代码冲突时，不得静默选择。必须：

1.  判断冲突是否属于实现错误；
2.  若设计确需变更，先向 `docs/decisions.md` 追加原因、影响和迁移方案；
3.  同步修改受影响文档；
4.  再修改代码。

## 2. 自主维护文档

Codex 被授权并被要求自主维护 Markdown。

必须自动更新：

- 数据库变化：`docs/06-database-schema.md`
- 分页、筛选、排序变化：`docs/07-query-pagination-export.md`
- UI 规则变化：`docs/02-ui-design-system.md`
- OneDrive 变化：`docs/14-onedrive-integration.md`
- 备份恢复变化：`docs/15-backup-recovery.md`
- 重要决策：追加 `docs/decisions.md`
- 每阶段完成：更新 `docs/module-status.md`

禁止删除历史决策。新决策只能追加；废弃旧决策时标记 `Superseded`
并链接新决策。

## 3. 技术栈锁定

### 前端

- React
- Vite
- TypeScript
- shadcn/ui Base UI
- Tailwind CSS
- Axios
- TanStack Query
- TanStack Table
- React Hook Form
- Zod
- Zustand
- ECharts
- Motion
- lucide-react

禁止引入 Ant Design、Material UI、Element、Radix 版本 shadcn
组件或另一套完整 UI 框架。

### 后端

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- Docker Compose
- Swagger/OpenAPI
- Pino
- Jest

## 4. 分层规则

### 前端调用链

```text
Page
→ Feature Hook
→ TanStack Query
→ API Module
→ Axios Instance
→ NestJS API
```

禁止：

- React 组件直接调用 Axios；
- React 组件直接使用 fetch；
- Zustand 保存服务端业务数据；
- 页面自行拼接不统一的错误提示。

### 后端调用链

```text
Controller
→ Application Service
→ Domain/Business Service
→ Prisma/Infrastructure
```

Controller 只负责 HTTP、DTO 和权限边界，禁止直接访问 Prisma。

## 5. 数据库规则

- 所有数据库修改必须通过 Prisma Migration。
- 所有金额、数量、成本、汇率使用 Decimal，禁止浮点数作为最终业务计算。
- 已过账业务单据禁止直接修改或物理删除。
- 主数据产生业务引用后只能停用。
- 业务编号与数据库 ID 分离。
- 所有关键幂等操作必须使用唯一幂等键。
- 所有过账流程使用数据库事务。
- 库存和财务过账优先使用 Serializable 事务，并处理可重试冲突。

## 6. SKU 与价格规则

SKU 仅表示可交易、可库存的商品身份。

SKU 禁止包含：

- 销售价；
- 成本价；
- 当前采购价。

销售价格、采购报价、成交价格和库存成本必须分开管理。业务单据必须保存成交快照。

## 7. 库存规则

禁止直接修改库存余额。

所有库存变化必须：

```text
业务单据
→ InventoryTransaction
→ InventoryTransactionLine
→ InventoryBalance
```

库存至少区分：

- `AVAILABLE`
- `QC_PENDING`
- `DEFECTIVE`
- `SUPPLIER_CLAIM`
- `SCRAPPED`

销售退货不能直接增加可销售库存，必须先进入待质检状态。

## 8. OneDrive 规则

所有文件必须经过 `FileService` 和 `StorageProvider`。

禁止：

- 保存本地绝对业务路径；
- 在 Product/SKU 表保存图片 URL；
- 在 PostgreSQL 保存图片二进制；
- 业务模块直接调用 Microsoft Graph。

OneDrive Token 不得明文写入数据库或 `.env`。必须使用 MSAL
持久化加密缓存。

## 9. UI 规则

默认使用彩色浅色主题，不得设计成整体黑白灰。

统一视觉：

- 品牌主色：靛蓝紫；
- 辅助色：青绿色；
- 强调色：琥珀色；
- 页面背景：带轻微冷灰紫色调；
- 深色侧边栏：深海军蓝，而不是纯黑；
- 卡片保持高可读性和适度层级。

所有列表页必须使用统一的
`DataTable`、筛选栏、分页器、空状态、错误状态和加载骨架。

## 10. 质量门槛

每阶段结束必须通过：

- TypeScript 类型检查；
- ESLint/Oxlint；
- Prettier；
- 单元测试；
- 集成测试；
- NestJS Build；
- Vite Build；
- Prisma validate/format；
- 核心业务 E2E 测试。

禁止在测试失败时继续下一阶段。

## 11. 完成汇报格式

每阶段必须输出：

1.  修改文件列表；
2.  数据库及 Migration 变化；
3.  新增/修改 API；
4.  业务规则实现情况；
5.  测试命令与结果；
6.  文档更新情况；
7.  未解决风险；
8.  下一阶段。
