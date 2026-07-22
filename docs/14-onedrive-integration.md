# 14. Microsoft Graph OneDrive 集成

## 1. 目标

OneDrive 用于：

- 产品图片；
- 供应商附件；
- 采购附件；
- 销售附件；
- 质量照片；
- 财务凭证；
- PostgreSQL 备份。

数据库仅保存 FileAsset 元数据。

## 2. 认证方式

推荐：

- `@azure/msal-node`
- Public Client
- Device Code Flow
- Authority：`https://login.microsoftonline.com/consumers`
- Delegated scopes：
  - `User.Read`
  - `Files.ReadWrite`
  - `offline_access`

不使用 Client Secret。

应用注册需要：

- 支持 Personal Microsoft accounts；
- 允许 Public Client Flow；
- 获得 Client ID。

## 3. 首次连接向导

系统设置 → OneDrive：

1.  检查 `MICROSOFT_CLIENT_ID`；
2.  点击"连接 OneDrive"；
3.  后端发起 Device Code Flow；
4.  前端展示登录网址、验证码、复制按钮和倒计时；
5.  用户完成授权；
6.  后端调用 `/me/drive` 验证；
7.  创建 `ERP_STORAGE` 目录；
8.  保存加密 Token Cache；
9.  显示账号、Drive ID、剩余容量和连接时间。

## 4. Token 安全

- 不把 Access Token/Refresh Token 明文放 PostgreSQL；
- 不写日志；
- 不返回前端；
- 使用 MSAL 完整 Token Cache；
- Token Cache 使用 AES-256-GCM 加密后写入 `SystemSetting`；
- 加密密钥由 `JWT_REFRESH_SECRET` 与当前机器、当前系统用户绑定信息派生，数据库中只有 IV、认证标签和密文；
- 应用日志关闭 MSAL PII，并对 authorization、cookie、password、token 和 secret 字段统一脱敏；
- 换电脑时重新授权即可。

## 5. 目录

```text
ERP_STORAGE/
├─ Products/{productId}/
├─ Purchase/{documentId}/
├─ Sales/{documentId}/
├─ Quality/{issueId}/
├─ Finance/{transactionId}/
└─ Backup/Database/
```

数据库保存相对 logicalPath，不保存本机路径。

## 6. 上传

图片限制：

- jpg/jpeg/png/webp；
- 单文件默认 10 MB；
- 拒绝 SVG 和可执行文件；
- 计算 SHA-256；
- 冲突使用 rename；
- 成功后创建 FileAsset。

普通文件使用简单上传。

当前实现对 10 MB 以内文件使用简单上传；超过 10 MB 使用 Upload Session，分片大小为
5 MB（符合 320 KiB 倍数要求），失败最多重试三次。通用上传入口上限 250 MB，商品图片
仍固定为 10 MB。简单上传先检查同名项并生成唯一后缀，Upload Session 使用
`conflictBehavior: rename`，不覆盖已有文件。

## 7. 展示图片

前端不得直接持有 Graph Token。

使用：

```text
GET /api/v1/files/{fileAssetId}/content
```

后端获得 Token、从 Graph 读取并流式返回，设置：

- Content-Type；
- ETag；
- Cache-Control；
- Content-Disposition。

## 8. 删除与替换

删除流程：

1.  检查业务引用；
2.  删除 OneDrive DriveItem；
3.  FileAsset 标记 DELETED；
4.  删除 ProductImage 关系；
5.  写审计日志。

替换主图采用上传新文件成功后再删除旧文件，避免失败导致图片丢失。

## 9. 离线和失败

FileAsset 状态：

- PENDING
- UPLOADING
- SYNCED
- FAILED
- DELETED

网络失败时保留临时文件和重试任务。

OneDrive 已连接时，上传先经过 `MockStorageProvider` 安全暂存，再同步 Graph。同步成功后
切换 FileAsset 的 provider 元数据并清理暂存；同步失败时保留暂存内容，把 FileAsset 标记为
`FAILED`，可通过文件中心或 `POST /files/{id}/retry` 重试。缺少 Client ID 或尚未连接时，
Mock Provider 作为完整本地存储使用，不阻塞商品图片、文件下载和业务附件。

## 10. 换电脑

新电脑恢复顺序：

1.  安装 Docker 与 ERP；
2.  打开 Bootstrap 恢复向导；
3.  输入 Client ID；
4.  重新授权 OneDrive；
5.  浏览备份；
6.  下载并恢复 PostgreSQL；
7.  FileAsset 元数据恢复后自动重新访问远端文件。

## 11. 连接状态与设置向导

设置页和 `GET /api/v1/onedrive/status` 使用同一状态机：

- `CLIENT_ID_MISSING`：未配置 Client ID；
- `NOT_CONNECTED`：未连接；
- `AUTHORIZING`：正在授权；
- `CONNECTED`：已连接；
- `REAUTH_REQUIRED`：Token 需要重新授权；
- `GRAPH_UNREACHABLE`：Graph 不可达；
- `STORAGE_FULL`：OneDrive 空间不足。

状态响应只返回授权向导信息、账号显示信息、Drive 元数据和容量，不返回任何 Token。
授权完成后必须验证 `/me/drive` 的 `driveType` 为 `personal`，并自动查找或创建
`ERP_STORAGE`。断开连接会取消正在执行的 Device Code Flow、移除 MSAL 账户、清除加密
缓存和连接元数据。

## 12. Phase 7 实现

- Migration：`202607160011_phase7_files`；
- Provider：`OneDriveStorageProvider`、`MockStorageProvider`；
- 统一边界：`FilesService`，业务模块和浏览器均不直接调用 Graph；
- 文件中心：服务端分页、搜索、Provider/状态/业务关联筛选、白名单排序、流式 CSV；
- 商品图库：最多 12 张、批量上传、唯一主图、完整排序、删除后自动补主图；
- 内容读取：浏览器通过带认证的 Axios Blob 请求 `/files/{id}/content`，不持有 Graph Token；
- 当前外部状态：`WAITING_FOR_EXTERNAL_CONFIGURATION`，等待用户提供
  `MICROSOFT_CLIENT_ID`；Mock Provider 已通过集成、API 和页面 E2E。
