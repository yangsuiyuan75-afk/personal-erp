# Personal ERP 本地启动与运维指南

Personal ERP 是面向单人、本地运行的采购、销售、库存、质量、财务、文件与备份工作台。业务数据保存在 PostgreSQL；未连接 OneDrive 时，文件与备份自动使用本地模拟存储，不影响其余模块。

## 1. 从零启动

### 环境要求

- Windows 10/11；
- Node.js 22 LTS；
- Corepack 与 pnpm 11.9.0；
- Docker Desktop（Linux containers）；
- Git。

### 初始化

在项目根目录执行：

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
Copy-Item .env.example .env
Copy-Item web/.env.example web/.env
pnpm install
```

编辑 `.env`，至少修改：

```env
POSTGRES_PASSWORD=请设置本地数据库密码
DATABASE_URL=postgresql://personal_erp:同一密码@localhost:5432/personal_erp?schema=public
JWT_ACCESS_SECRET=至少32字符的随机值
JWT_REFRESH_SECRET=另一段至少32字符的随机值
BOOTSTRAP_RECOVERY_KEY=至少16字符的本地恢复密钥
```

如果端口被占用或被 Windows 保留，同时修改 `POSTGRES_PORT`、`POSTGRES_TEST_PORT`、`DATABASE_URL` 和 `TEST_DATABASE_URL` 中的端口。本工作区当前使用主库 5551、测试库 5552；全新安装可继续使用默认 5432/5433。

启动数据库并应用全部 Migration：

```powershell
docker compose up -d postgres
pnpm prisma:generate
pnpm prisma:migrate
```

启动前后端开发服务：

```powershell
pnpm dev
```

打开：

- Web：<http://localhost:5173>
- Swagger：<http://localhost:3000/api/docs>
- 健康检查：<http://localhost:3000/api/v1/health>

首次打开时会自动显示“创建本地管理员”。设置用户名和强密码后即进入系统；数据库已有管理员时显示登录页，不能创建第二个管理员。

私人单用户电脑如需自动填充登录表单，可在 `web/.env` 设置
`VITE_DEFAULT_LOGIN_USERNAME` 和 `VITE_DEFAULT_LOGIN_PASSWORD`。留空即关闭预填；所有
`VITE_` 值都会进入浏览器端，不能视为密钥，共享电脑或可被他人访问的环境必须留空。

## 2. 导入期初库存

1. 先在商品中心建立 Category、Product、SKU、Unit；SKU 不填写售价或成本。
2. 在“库存中心 → 库存地点”建立主仓、质检仓和需要的渠道仓。AliExpress 平台仓必须建立为真实 `EXTERNAL_WAREHOUSE`，不能只记虚拟数量。
3. 返回“库存余额”，打开“业务操作 → 期初库存”。
4. 下载 CSV 模板，填写 `locationCode`、`skuCode`、`stockStatus`、`quantity`、`unitCost`、`batchNo` 和备注。
5. 上传 CSV，先处理逐行校验错误，再确认业务时间并生成期初流水。
6. 到库存余额、库存流水和批次追溯核对数量、移动平均成本与批次来源。

期初、调整、调拨和业务单据都会通过库存流水过账；不要直接修改库存余额。

## 3. 连接 OneDrive Personal

真实 OneDrive 连接需要用户自行完成一次 Microsoft 应用注册：

1. 在 Microsoft Entra 管理中心注册公共客户端应用，账户类型选择个人 Microsoft 账户。
2. 在“身份验证”中允许公共客户端流；不创建 Client Secret。
3. 添加 Microsoft Graph delegated permissions：`User.Read`、`Files.ReadWrite`、`offline_access`。
4. 复制 Application (client) ID，写入 `.env`：

```env
MICROSOFT_CLIENT_ID=你的客户端ID
MICROSOFT_AUTHORITY=https://login.microsoftonline.com/consumers
ONEDRIVE_ROOT_FOLDER=ERP_STORAGE
```

5. 重启后端，进入“文件中心 → OneDrive 设置 → 连接 OneDrive”。
6. 按页面显示的 Device Code 和验证地址，由本人登录个人 Microsoft 账户并同意权限。
7. 回到设置页等待状态变为“已连接”，再上传商品图片或创建备份。

设置页会明确区分：未配置 Client ID、未连接、正在授权、已连接、Token 需要重新授权、Graph 不可达和 OneDrive 空间不足。Token 由 MSAL 加密缓存保存，不写入 `.env`、业务表或日志。更换电脑或密钥后，使用“重新授权”。

未提供 `MICROSOFT_CLIENT_ID` 时，状态保持 `WAITING_FOR_EXTERNAL_CONFIGURATION`，完整本地模拟适配器继续可用。

## 4. 商品图片与文件

进入 Product 列表打开商品图库，可上传多张图片、设置主图、拖动排序和删除。数据库只保存 `FileAsset` 元数据与业务关系，不保存图片二进制或本地绝对业务路径。文件中心可按 Provider、状态、模块、实体和日期查询。

## 5. 备份与恢复

### 常规备份

1. 进入“系统 → 备份恢复”。
2. 点击“立即备份”；系统生成 PostgreSQL custom dump、Manifest 和 SHA-256 校验。
3. OneDrive 已连接时同步到 OneDrive；否则使用本地模拟 Provider，并保留独立恢复副本。
4. 可下载、重新校验或永久锁定恢复点。

系统还会在最近备份过旧且之后存在业务变化时执行启动补偿备份，并按业务过账量提示建立恢复点。

### 登录后恢复

1. 选择状态为 `VERIFIED` 的恢复点并点击恢复。
2. 输入当前管理员密码和精确短语 `RESTORE <backupNo>`。
3. 系统进入维护模式，先创建并锁定 `PRE_RESTORE`，再校验 SHA、Schema 与 PostgreSQL 版本。
4. 恢复完成后自动运行 Migration、健康检查与关键表计数核对；失败时尝试回滚 `PRE_RESTORE`。

### 数据库不存在时 Bootstrap 恢复

把 `.dump` 与同名 `.manifest.json` 放在同一目录，然后执行：

```powershell
pnpm backup:bootstrap-restore -- `
  -BackupPath C:\Backups\BKP-20260716.dump `
  -ConfirmPhrase "BOOTSTRAP RESTORE personal_erp" `
  -DatabaseUrl "postgresql://personal_erp:你的密码@localhost:5432/personal_erp?schema=public"
```

脚本只允许恢复到不存在或没有 Personal ERP Schema 的数据库，并检查 PGDMP 标头、可选 Manifest SHA、pg_restore catalog、Migration 兼容性和数据库健康。已有业务 Schema 时必须使用登录后的 `PRE_RESTORE` 流程。

数据库存在但没有 Schema/管理员时，也可在“创建本地管理员”页展开 Bootstrap 恢复，提供 `.dump`、`BOOTSTRAP_RECOVERY_KEY` 和确认短语 `BOOTSTRAP RESTORE`。

## 6. 质量检查

启动测试数据库：

```powershell
docker compose --profile test up -d postgres-test
```

运行全部门禁：

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm --filter @personal-erp/server test:e2e
pnpm test:e2e
pnpm build
pnpm prisma:validate
```

完整验收记录见 `IMPLEMENTATION-REPORT.md`、`docs/module-status.md` 和 `design-qa.md`。

## 7. 仍需用户完成的外部配置

- 提供并配置 `MICROSOFT_CLIENT_ID`；
- 在 Microsoft 应用中启用个人账户、公共客户端流和三项 delegated permissions；
- 首次连接或 Token 失效时，由本人完成 Device Code 授权；
- 确认 OneDrive 有足够空间。

除此之外，Personal ERP 可在本地模拟文件 Provider 下完整启动和使用。
