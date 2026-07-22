# 16. 登录、安全与审计

## 1. 单用户认证

第一版只有一个本地管理员。

- 密码使用 Argon2id；
- Access Token 短期；
- Refresh Token 使用 HttpOnly Cookie；
- 限制本机来源；
- 首次启动创建管理员；
- 支持修改密码；
- 不实现复杂 RBAC。

Buyer 不是登录用户。

## 2. CORS

开发环境仅允许配置的 Vite origin。

生产本地环境仅允许本机应用 origin。

## 3. 输入安全

- DTO 白名单；
- 文件 MIME 与扩展名双重检查；
- 文件名清洗；
- SQL 全部参数化；
- 排序字段白名单；
- 导出防公式注入；
- 错误信息不暴露数据库细节。

## 4. 审计

审计日志只追加，不提供普通删除。

支持按：

- 模块；
- 操作；
- 实体；
- 日期；
- 结果

分页查询。

## 5. Phase 1 实现细节

- 首次初始化在 `Serializable` 事务内取得 PostgreSQL advisory lock，只允许创建一个管理员；
- Access Token 为 15 分钟 JWT，仅保存在前端内存；
- Refresh Token 为 30 天高熵不透明值，仅通过 `HttpOnly`、`SameSite=Strict` Cookie 传输；
- 数据库只保存 Refresh Token 的 SHA-256，并在每次刷新时轮换、撤销旧会话；
- 修改密码后撤销全部刷新会话；
- 除健康检查、认证状态、初始化、登录、刷新与退出外，API 默认要求 Bearer Token；
- 审计 before/after 内容递归清除 password、token、authorization、cookie、secret 等字段；
- 认证失败返回统一错误契约，不泄露用户名是否存在或底层数据库错误。

## 6. 本机登录预填

- 登录页可选从 `web/.env` 读取 `VITE_DEFAULT_LOGIN_USERNAME` 与 `VITE_DEFAULT_LOGIN_PASSWORD`；首次创建管理员不读取预填密码；
- 预填不改变 Argon2id 校验、会话轮换或认证边界；
- `VITE_` 配置会进入浏览器端，只允许用于私人单用户电脑，不属于安全存储；共享电脑或可被他人访问的环境必须留空；
- 未配置时保留浏览器原生 `username` / `current-password` 自动填充能力。

## 7. Phase 8 恢复安全

- 已初始化系统的一键恢复同时要求当前管理员密码与精确短语 `RESTORE <backupNo>`；
- 恢复期间进入全局维护模式，除 Health、Backup 与 Bootstrap Recovery 外的业务访问返回 503；
- 恢复前强制创建并锁定 `PRE_RESTORE`，失败时自动尝试回滚；
- 无 Schema/无管理员时，公共 Bootstrap 上传仅在配置 `BOOTSTRAP_RECOVERY_KEY` 后可用；恢复密钥至少 16 字符，服务端使用固定长度摘要与恒定时间比较；
- 已存在管理员时公共 Bootstrap Restore 自动关闭，必须登录后走密码保护流程；
- dump、数据库密码、恢复密钥和命令参数均不得写入审计 after/before 或日志；
- 恢复审计记录备份编号、PRE_RESTORE 编号、结果与 requestId，不记录口令。
