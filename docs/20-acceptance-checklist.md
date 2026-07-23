# 20. 最终验收清单

## UI

- [x] 默认浅色且具有紫、青绿、琥珀色层级
- [x] 侧边栏不是纯黑
- [x] 所有列表使用统一 DataTable
- [x] 分页支持 10/20/50/100
- [x] 查询条件刷新后保留
- [x] Loading、空状态、错误状态统一
- [x] 深色与跟随系统可用

## 查询

- [x] 所有列表服务端分页
- [x] keyword 查询
- [x] 状态筛选
- [x] 日期范围
- [x] 服务端排序
- [x] 模块专属筛选
- [x] CSV 导出

## 业务

- [x] SKU 无价格/成本字段
- [x] 采购成交价保存快照
- [x] 销售成交价保存快照
- [x] 库存禁止直接修改
- [x] 移动平均成本正确
- [x] 平台仓作为物理 Location
- [x] 退货先进入 QC
- [x] 质检数量守恒
- [x] 供应商换货/赔付可追溯
- [x] 月度入账可按渠道查询

## OneDrive

- [x] Client ID 配置检测
- [x] Device Code 登录状态机与模拟 Graph 契约
- [ ] 真实个人账号 Device Code 授权与 `/me/drive` 连接验证（`WAITING_FOR_EXTERNAL_CONFIGURATION`）
- [ ] 真实 OneDrive `ERP_STORAGE` 自动创建（`WAITING_FOR_EXTERNAL_CONFIGURATION`）
- [x] 商品图片上传、展示、删除与放大预览
- [x] Token 不进入数据库和日志
- [x] 大文件 Upload Session
- [x] 断线与重新授权提示

## 备份

- [x] 手工备份
- [x] 启动补偿备份
- [x] Mock Provider 上传、回读与校验
- [ ] 真实 OneDrive 上传、回读与校验（`WAITING_FOR_EXTERNAL_CONFIGURATION`）
- [x] SHA-256 校验
- [x] 保留策略
- [x] 本地下载
- [x] 恢复前备份
- [x] 空数据库 Bootstrap 恢复
- [x] 恢复后健康检查

## 工程

- [x] Swagger
- [x] 审计日志
- [x] 单元测试
- [x] 集成测试
- [x] E2E
- [x] Build 全通过
- [x] 文档已自动更新

除三项需要真实 Microsoft 账户与 `MICROSOFT_CLIENT_ID` 的外部验收外，本地实现与模拟适配器验收全部完成。外部项不会阻塞本地 ERP 使用。
