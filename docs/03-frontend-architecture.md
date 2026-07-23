# 03. 前端架构

## 1. 目录

```text
web/src/
├─ app/
│  ├─ providers/
│  ├─ router/
│  └─ layout/
├─ components/
│  ├─ ui/
│  ├─ data-table/
│  ├─ forms/
│  └─ feedback/
├─ features/
│  ├─ categories/
│  ├─ products/
│  ├─ skus/
│  ├─ inventory/
│  ├─ purchase/
│  ├─ sales/
│  ├─ quality/
│  ├─ finance/
│  ├─ files/                 # OneDrive 设置状态与授权操作
│  └─ settings/
├─ lib/
│  ├─ axios/
│  ├─ query/
│  ├─ format/
│  └─ validation/
├─ stores/
└─ styles/
```

## 2. Axios

创建唯一 Axios Instance。

统一：

- baseURL；
- 30 秒默认超时；
- 请求 ID；
- JWT；
- 401 刷新；
- API 错误映射；
- 下载流处理；
- 取消请求。

Axios 请求拦截器统一维护进行中的请求数量；任一 API 请求期间显示全局加载指示，避免页面对网络操作没有反馈。

上传和备份允许单独设置更长超时。

## 3. TanStack Query

Query Key 必须集中定义：

```text
products.list(params)
products.detail(id)
inventory.balances(params)
finance.transactions(params)
```

Mutation 成功后只失效必要查询。

分页切换时保留上一页数据，避免表格闪烁。

## 4. URL 状态

列表页以下状态写入 URL Search Params：

- page；
- pageSize；
- keyword；
- filters；
- sortBy；
- sortOrder；
- dateFrom；
- dateTo。

浏览器刷新和前进后退必须恢复页面状态。

## 5. Zustand

只保存：

- Sidebar 折叠；
- Theme；
- 表格列可见性偏好；
- 最近使用筛选；
- 页面 UI 偏好。

禁止保存 Product、Inventory、Finance 等服务端数据。

## 6. 表单

所有表单：

```text
React Hook Form + Zod + shadcn Form
```

前后端校验规则尽量一致。

金额、数量输入以字符串进入表单，提交前用 Decimal 兼容格式校验，避免
JavaScript 浮点误差。

## 7. 错误反馈

统一 Toast：

- 保存成功；
- 保存失败；
- 网络错误；
- 权限失效；
- OneDrive 未连接；
- 备份失败；
- 库存不足；
- 幂等冲突。

错误必须显示可操作信息，不能只显示"系统错误"。

## 8. Phase 8 前端模块

```text
features/backup/api.ts
→ use-backups.ts（TanStack Query）
→ backup-page.tsx（DataTable + URL 查询 + 恢复 Dialog）
```

- `/backups` 提供服务端分页列表、状态概览、CSV、下载、校验、锁定、立即备份与恢复；
- `backupStatus`、`trigger`、`locked` 与通用查询参数同步 URL；
- Auth bootstrap 页面仅调用公共 `bootstrap-recovery` API，不直接调用 Axios 之外的网络层；
- 服务端恢复成功后刷新会话与页面，避免继续使用恢复前的缓存业务数据。
