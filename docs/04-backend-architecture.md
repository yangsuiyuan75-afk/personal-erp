# 04. 后端架构

## 1. 目录

```text
server/src/
├─ common/
│  ├─ decorators/
│  ├─ dto/
│  ├─ errors/
│  ├─ filters/
│  ├─ guards/
│  ├─ interceptors/
│  └─ utils/
├─ config/
├─ database/
├─ modules/
├─ infrastructure/
│  ├─ microsoft-graph/
│  ├─ backup/
│  └─ filesystem/
└─ main.ts
```

## 2. API 层

Controller：

- DTO；
- HTTP 状态；
- 调用 Application Service；
- 不包含业务计算；
- 不直接访问 Prisma。

## 3. 事务

以下操作必须单事务：

- 采购收货过账；
- 销售出库过账；
- 销售退货接收；
- 质检状态转移；
- 供应商换货入库；
- 供应商赔付入账；
- 付款及应付分配；
- 收款及应收分配；
- 库存调拨确认。

使用 Serializable 隔离级别，并对数据库可重试冲突有限次数重试。

## 4. 幂等

所有过账端点接受 `Idempotency-Key`。

数据库保存幂等键、请求内容哈希和响应结果。

相同键相同内容：返回原结果。

相同键不同内容：返回幂等冲突。

## 5. 日志

Pino 输出结构化日志：

- requestId；
- module；
- action；
- entityId；
- duration；
- result；
- errorCode。

不得记录密码、JWT、OneDrive Token 或文件原始内容。

## 6. 审计

关键操作记录：

- 新增、编辑、停用主数据；
- 单据确认、取消、反向；
- 质量责任变更；
- 供应商赔付；
- 财务过账；
- 备份恢复；
- OneDrive 连接和断开。

审计记录包含 before/after JSON，但必须脱敏。

## 7. Phase 8 BackupModule

- Controller 只处理 DTO、认证边界、流式下载与 multipart Bootstrap 上传；
- BackupService 编排状态、Manifest、SHA、FileService、保留策略、维护模式与审计；
- PostgresBackupRunner 是唯一允许启动 `pg_dump`、`pg_restore` 与 Prisma migrate 子进程的基础设施边界；
- MaintenanceGuard 在恢复期间阻止普通业务访问，Health、Backup、Bootstrap Recovery 使用明确元数据放行；
- PostgreSQL 工具错误只返回清理后的 stderr，不记录 DATABASE_URL 或密码；
- 启动补偿任务在 Nest application bootstrap 后异步执行，测试环境明确禁用。
