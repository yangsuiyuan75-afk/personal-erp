# 15. 数据库备份与恢复

## 1. 已实现架构

备份模块使用 PostgreSQL 原生工具：

```text
pg_dump -Fc
pg_restore --clean --if-exists --single-transaction
```

默认本地 Docker 环境通过 `docker exec personal-erp-postgres` 调用容器内工具；也可用
`PG_DUMP_PATH`、`PG_RESTORE_PATH` 指向主机工具。测试库按 `POSTGRES_TEST_PORT`（默认 5433）自动使用
`personal-erp-postgres-test`，两个容器名均可由环境变量覆盖。

调用链保持：

```text
BackupController
→ BackupService
→ PostgresBackupRunner
→ FileService
→ StorageProvider（OneDrive 或 Mock）
```

业务模块不直接调用 Graph，也不在 PostgreSQL 保存 dump、图片或绝对业务路径。

## 2. 备份产物与完整性

每次生成：

- `<backupNo>.dump`：PostgreSQL custom format；
- `<backupNo>.manifest.json`：backupNo、createdAt、appVersion、schemaVersion、
  PostgreSQL version、fileSize、sha256、pg_restore catalogEntries 与关键表 recordCounts。

流程为：

1. 创建 BackupHistory `CREATING`；
2. `pg_dump -Fc`；
3. `pg_restore --list` 验证目录至少包含业务表；
4. 计算 SHA-256 并生成 Manifest；
5. 保留本地独立恢复副本；
6. 经 FileService 上传 dump 与 Manifest；
7. 从 Provider 重新下载 dump 并复算 SHA-256；
8. 校验一致后标记 `VERIFIED`。

OneDrive 未配置或未连接时使用完整 Mock Provider，功能不阻塞；真实 OneDrive 已连接时保存
`cloudUploadedAt`。

## 3. 触发策略

### 启动补偿

NestJS 启动后后台检查最近成功备份。最近恢复点超过
`BACKUP_AUTO_AFTER_HOURS`（默认 24）且之后存在库存、采购、销售、质量或财务审计变化时，
以 `STARTUP_COMPENSATION` 创建备份。Jest 与 `NODE_ENV=test` 不启动后台任务。

### 业务量提醒

状态接口统计上次备份后的关键过账。达到 `BACKUP_OPERATION_THRESHOLD`（默认 50）时，工作台
显示建议备份；用户可立即后台执行。

### 手工备份

系统 → 备份恢复 → 立即备份。手工恢复点可锁定为永久保留。

### 恢复前保护

认证恢复始终先创建并锁定 `PRE_RESTORE`，不允许跳过。

## 4. 保留策略

分层保留按 `APP_TIMEZONE` 计算：

- 最近 7 个每日恢复点；
- 最近 4 个每周恢复点；
- 最近 12 个每月恢复点；
- locked 恢复点永久保留。

只有 `VERIFIED`、`verifiedAt` 非空且 OneDrive 上传成功的恢复点参与清理。清理会删除 dump、
Manifest 的 Provider 对象与本地副本，并把历史记录标为 `EXPIRED`；不会物理删除审计历史。

## 5. 认证一键恢复

工作台恢复要求：

- 当前管理员密码；
- 精确短语 `RESTORE <backupNo>`；
- 恢复点状态为 `VERIFIED`。

执行顺序：

1. 进入全局维护模式，锁定业务访问；
2. 重新计算 SHA-256；
3. `pg_restore --list` 验证文件目录；
4. 检查备份 Schema 不高于当前版本、PostgreSQL 主版本不高于当前容器；
5. 创建并物化 `PRE_RESTORE`；
6. 断开 Prisma 连接；
7. 单事务执行 `pg_restore --clean --if-exists`；
8. 执行 `prisma migrate deploy` 兼容迁移；
9. 恢复 Prisma 连接并执行 `SELECT 1`；
10. 对比 Manifest 的 Product、SKU、InventoryBalance、采购、销售、质量、财务和文件计数；
11. 重新登记目标恢复点与 PRE_RESTORE FileAsset；
12. 写审计并退出维护模式。

恢复失败时自动尝试用 PRE_RESTORE 回滚；若回滚也失败，日志明确记录两层错误，维护状态在请求
结束时释放以便人工处理。

## 6. 空数据库 Bootstrap

### 数据库存在但无 Schema/无管理员

`GET /bootstrap-recovery/status` 与 `POST /bootstrap-recovery/restore` 为最小公共恢复入口。
`/auth/status` 会用 `to_regclass` 识别缺失 Schema，而不是直接访问不存在的 AdminUser 表。

上传恢复要求：

- `.env` 配置至少 16 字符的 `BOOTSTRAP_RECOVERY_KEY`；
- 请求头 `X-Recovery-Key`；
- 确认短语 `BOOTSTRAP RESTORE`；
- `.dump` 具有 `PGDMP` custom format 目录。

一旦数据库存在管理员，公共恢复立即关闭，必须登录后使用 PRE_RESTORE 流程。

### 数据库本身不存在

NestJS 不能在目标数据库不存在时建立 Prisma 连接，因此根目录提供：

```powershell
pnpm backup:bootstrap-restore -- `
  -BackupPath C:\Backups\BKP-....dump `
  -ConfirmPhrase "BOOTSTRAP RESTORE personal_erp"
```

`scripts/bootstrap-restore.ps1` 验证名称、确认短语、PGDMP 标头、可选 Manifest SHA、
pg_restore catalog，只允许恢复到不存在或无 Personal ERP Schema 的数据库；随后执行可选
Migration compatibility check 和健康检查。已含业务 Schema 时脚本拒绝覆盖，要求回到登录后
流程。

## 7. 下载与新电脑恢复

每个未过期恢复点可从工作台下载 `.dump`。新电脑流程：

1. 安装 Docker、Node.js 与 pnpm；
2. 配置 `.env` 并启动 PostgreSQL 容器；
3. 从 OneDrive Web 的 `ERP_STORAGE/Backups/YYYY/MM` 下载 dump 与 Manifest；
4. 数据库不存在时运行 Bootstrap 脚本；数据库空 Schema 时也可启动前端上传恢复；
5. 启动应用并登录原管理员；
6. 重新完成 OneDrive Device Code 授权（Token Cache 机器绑定，不能迁移明文 Token）；
7. 在备份工作台执行校验并核对关键记录计数。

## 8. 环境变量

```env
BACKUP_AUTO_AFTER_HOURS=24
BACKUP_OPERATION_THRESHOLD=50
BACKUP_TEMP_DIR=
PG_DUMP_PATH=
PG_RESTORE_PATH=
POSTGRES_CONTAINER_NAME=personal-erp-postgres
POSTGRES_TEST_CONTAINER_NAME=personal-erp-postgres-test
BOOTSTRAP_RECOVERY_KEY=
```

`BACKUP_TEMP_DIR` 留空时使用应用工作目录下 `.data/backups`。数据库只保存 backupNo 与逻辑
元数据，不保存该绝对路径。
