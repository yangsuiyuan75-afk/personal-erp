# 14. Microsoft Graph OneDrive 集成

## 1. 目标与边界

OneDrive 用于 PostgreSQL 备份和产品图片存储。前端保留“系统 → OneDrive 设置”和产品编辑中的图片入口；不提供文件资产中心、通用上传下载或其他业务附件接口。

`FileAsset` 作为备份文件、产品图片的内部元数据和 `StorageProvider` 适配边界；产品模块仅经 `FilesService` 操作专用图片接口，浏览器不得直接读写通用 FileAsset。

## 2. 认证方式

- `@azure/msal-node`
- Public Client + Device Code Flow
- Authority：`https://login.microsoftonline.com/consumers`
- Delegated scopes：`User.Read`、`Files.ReadWrite`、`offline_access`
- 不使用 Client Secret

应用注册必须支持 Personal Microsoft accounts、启用 Public client flow，并提供 `MICROSOFT_CLIENT_ID`。

## 3. 设置流程

“系统 → OneDrive 设置”与 `GET /api/v1/onedrive/status` 使用同一状态机：

- `CLIENT_ID_MISSING`：未配置 Client ID；
- `NOT_CONNECTED`：尚未授权；
- `AUTHORIZING`：等待设备代码登录完成；
- `CONNECTED`：Graph 与个人网盘可用；
- `REAUTH_REQUIRED`：缓存失效，需要重新授权；
- `GRAPH_UNREACHABLE`：Graph 不可达；
- `STORAGE_FULL`：OneDrive 空间不足。

连接操作由 `POST /api/v1/onedrive/connect/start` 启动，前端展示登录网址、验证码、复制按钮和倒计时。授权完成后，后端验证 `/me/drive` 的 `driveType` 为 `personal`，创建或复用 `ERP_STORAGE/Backup/Database`。断开连接使用 `DELETE /api/v1/onedrive/connection`，同时取消 Device Code Flow、移除 MSAL 账户、清除加密缓存和连接元数据。

## 4. Token 安全

- 不把 Access Token 或 Refresh Token 明文写入 PostgreSQL、日志或前端；
- 使用完整 MSAL Token Cache；
- Token Cache 经 AES-256-GCM 加密后存入 `SystemSetting`；
- 密钥由 `JWT_REFRESH_SECRET` 与当前机器、当前系统用户绑定信息派生；
- 日志关闭 MSAL PII，并脱敏 authorization、cookie、password、token 和 secret 字段；
- 换电脑后重新授权，不迁移 Token。

## 5. 备份存储

```text
ERP_STORAGE/
└─ Backup/
   └─ Database/
      ├─ {backupNo}.dump
      └─ {backupNo}.manifest.json
└─ Products/
   └─ {productId}/
      └─ {imageFileName}
```

数据库仅保存相对 logicalPath 和 FileAsset 元数据，不保存本机绝对路径、备份二进制或图片二进制。未配置或未连接 OneDrive 时，`MockStorageProvider` 作为本地回退；已连接时先安全暂存，再同步 Graph。同步失败会保留失败记录；备份失败时用户重新执行备份，图片失败时用户修复 OneDrive 设置后重新上传。

## 6. 当前外部状态

`MICROSOFT_CLIENT_ID` 尚未提供时，状态必须显示 `WAITING_FOR_EXTERNAL_CONFIGURATION`，不得把模拟 Provider 表示为真实 OneDrive 已连接。
