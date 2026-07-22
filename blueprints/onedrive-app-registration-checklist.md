# OneDrive 应用注册清单

Codex 无法代替用户完成此门户操作。

需要创建支持个人 Microsoft 账户的应用，并获得 Client ID。

检查：

- [ ] 支持 Personal Microsoft accounts
- [ ] Public client flow 已启用
- [ ] Delegated permission：User.Read
- [ ] Delegated permission：Files.ReadWrite
- [ ] 请求 scope：offline_access
- [ ] Client ID 已写入 `MICROSOFT_CLIENT_ID`
- [ ] 未创建或使用 Client Secret
- [ ] authority 使用 consumers
- [ ] 首次授权后 `/me/drive` 返回 `driveType: personal`
