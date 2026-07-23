# Architecture Decision Log

## ADR-001 --- 单用户本地 ERP

Status: Accepted

系统本地运行，不实现多租户和企业级审批。

## ADR-002 --- SKU 不保存价格和成本

Status: Accepted

SKU 是主数据；销售价、采购报价、成交价和库存成本分离。

## ADR-003 --- PostgreSQL 使用 Docker

Status: Accepted

数据库使用持久化 Volume，提供一键备份恢复。

## ADR-004 --- shadcn/ui Base UI

Status: Accepted

所有基础组件使用 Base UI 版本，禁止与 Radix 版本混用。

## ADR-005 --- Axios + TanStack Query

Status: Accepted

Axios 负责 HTTP，TanStack Query 负责服务端状态。

## ADR-006 --- 彩色 Iris Operations 主题

Status: Accepted

默认浅色，紫色主品牌、青绿辅助、琥珀提醒、深海军蓝侧边栏，避免整体黑白。

## ADR-007 --- 服务端分页

Status: Accepted

所有业务列表使用后端分页、筛选和排序。

## ADR-008 --- 退货强制质检

Status: Accepted

销售退货不能直接回可售库存。

## ADR-009 --- 批次用于追溯，移动平均用于成本

Status: Accepted

出库 FIFO 分配批次用于供应商来源追踪，但成本采用移动平均。

## ADR-010 --- OneDrive Personal + Microsoft Graph

Status: Accepted

使用公共客户端 Device Code Flow、consumers authority 和 delegated
permission。

## ADR-011 --- 非固定时刻备份

Status: Accepted

采用启动补偿、业务量提醒和手工备份，不依赖凌晨定时。

## ADR-012 --- Data-first 库存工作区

Status: Accepted

用户从三套视觉稿中选择数据优先方向。库存余额表是核心工作面，筛选位于统一工具栏，选中 SKU 的库存分布、成本与批次追溯显示在右侧上下文栏。其他列表页复用同一密度和交互规则。

## ADR-013 --- Access Token 仅驻留内存，Refresh Token 轮换

Status: Accepted

前端不把 Access Token 写入 localStorage。短期 Access Token 仅驻留运行内存；长期会话通过 HttpOnly、SameSite=Strict Cookie 中的不透明 Refresh Token 恢复。数据库只保存 Refresh Token 的 SHA-256，刷新即轮换并撤销旧值，以降低浏览器脚本读取和数据库泄露后的风险。

## ADR-014 --- 统一库存过账内核

Status: Accepted

期初、库存调整、仓库调拨以及后续采购、销售和质量业务共享 `InventoryPostingService`。该服务是唯一可写 `InventoryBalance` 的应用边界，统一执行 Serializable 事务、幂等校验、负库存保护、移动平均成本、库存流水和 FIFO 批次分配。业务模块只提交有来源单据的有符号库存行，并在同一事务内完成自身状态更新。

## ADR-015 --- 采购退货保留应付历史并单列供应商退款

Status: Accepted

采购退货不删除或回写历史收货、应付与付款。退货金额先通过 `PayableAdjustment` 冲减尚未支付的应付余额；超过未付余额的部分创建 `SupplierCredit`，表示供应商应退款或可供后续采购抵扣。库存侧始终引用原收货明细并优先扣减指定采购批次。

## ADR-016 --- 默认售价允许客户和渠道维度同时为空

Status: Accepted

`docs/06-database-schema.md` 原先要求 `SalesPrice.salesChannelId` 与 `customerId` 至少一个存在，但 `docs/11-sales-management.md` 明确包含默认价回退。为实现完整价格优先级，允许两者同时为空表示默认价；客户价和渠道价仍独立建模，同一 SKU、客户、渠道组合的有效区间禁止重叠。该变化只新增默认价格能力，不影响既有数据迁移。

## ADR-017 --- 渠道库存按模式执行真实扣减

Status: Accepted

外部平台仓使用关联渠道的真实 `InventoryLocation` 和 `InventoryBalance`；虚拟渠道额度只通过 `ChannelAllocationItem.quantity - consumedQuantity` 限制可售量，出库仍扣减绑定的实际地点库存。销售出库在同一 Serializable 事务内完成余额扣减、FIFO 批次分配、额度消费、订单状态和应收生成，防止额度或库存并发超卖。

## ADR-018 --- 质检跨状态保持数量与库存价值守恒

Status: Accepted

确认销售退货质检时，不允许业务模块直接编辑余额。全部接收数量必须从 `QC_PENDING` 通过统一库存过账内核分流至 `AVAILABLE`、`DEFECTIVE`、`SUPPLIER_CLAIM` 或 `SCRAPPED`，且逐行分类总量必须等于接收量。过账行使用同一成本组计算跨状态移动平均成本，良品仅恢复原销售出库批次的剩余量，从而同时保证数量、库存价值和批次来源可追溯。

## ADR-019 --- 供应商索赔结算不伪造采购与资金业务

Status: Accepted

供应商换货生成新的库存批次但不产生采购应付；现金赔付先形成 `SupplierCompensationReceivable`，真实收款由财务模块生成资金流水；下次抵扣形成 `SupplierCredit`，不伪造成现金入账。索赔结算使用独立幂等记录，即使索赔已结案，相同键和相同请求仍可取得原处理结果。

## ADR-020 --- 账户余额只由已过账资金流水派生

Status: Accepted

`FinancialAccount` 不保存可手工覆盖的余额。页面和 API 以 `FinancialTransaction` 的流入减流出实时汇总账户余额；期初、修正、平台费、物流费和其他收支必须通过 `AccountAdjustment` 幂等过账。草稿单据、应收应付和 Supplier Credit 均不直接改变账户余额。

## ADR-021 --- 现金结算与非现金抵扣分栏

Status: Accepted

付款分配把现金 `amount` 与 Supplier Credit 的 `creditAmount` 分开。现金只增加 `Payable.paidAmount` 并创建资金流出；抵扣只增加 `Payable.creditedAmount` 与 `SupplierCredit.appliedAmount`。这样月度现金流、供应商支出和账户余额不会把非现金抵扣误算为真实付款。

## ADR-022 --- 修正 Phase 4 迁移目录顺序

Status: Accepted

原 Phase 4 销售迁移目录 `20260716132543` 在字典序上晚于 Phase 5，但 Phase 5 的质量模型依赖销售阶段创建的 `ReceivableStatus`、销售退货等对象，导致全新影子数据库无法顺序重放。迁移内容未改变，目录和既有开发/测试库记录统一改名为 `202607160005_phase4_sales`。完整 Phase 0–6 迁移链已在临时空数据库验证后删除临时库。

## ADR-023 --- OneDrive 同步前先安全暂存

Status: Superseded by ADR-037

缺少 Client ID 或未授权时，完整文件能力由 `MockStorageProvider` 提供；OneDrive 已连接时，
上传先写入 Mock Provider 暂存，再通过 `OneDriveStorageProvider` 同步 Graph。只有远端上传和
FileAsset 元数据切换都成功后才清理暂存。Graph 断线、配额不足或 Token 失效时 FileAsset
标记 `FAILED` 并保留暂存内容，用户可在文件中心重试。这样外部配置和网络故障不阻塞本地
ERP，也不会把未完成上传伪装成已同步文件。

ADR-037 移除了用户侧文件中心与重试入口；安全暂存策略仅继续服务于备份模块，失败后由用户修复 OneDrive 设置并重新执行备份。

## ADR-024 --- MSAL Cache 使用机器绑定的 AES-256-GCM 密文

Status: Accepted

完整 MSAL Cache 由 cache plugin 序列化后使用 AES-256-GCM 加密，密钥由
`JWT_REFRESH_SECRET`、机器名、系统用户名和应用域分隔符派生。PostgreSQL 只保存版本、IV、
认证标签和密文；前端、API 和日志均接触不到 Token。迁移电脑或密钥变化后无法解密旧缓存，
系统显示“Token 需要重新授权”，由用户重新执行 Device Code Flow，不尝试弱化加密或迁移
明文 Token。

## ADR-025 --- 备份文件与业务文件共用 FileService 边界

Status: Accepted

`pg_dump -Fc` 先生成独立本地恢复副本，再由 `FileService` 写入 Mock 或 OneDrive
StorageProvider；dump 和 manifest 上传后重新读取并校验 SHA-256。BackupHistory 只保存
FileAsset 引用、Manifest、校验值和状态，不保存绝对路径或二进制。只有 OneDrive 上传成功且
校验通过的恢复点参与 7 日、4 周、12 月分层清理；手工锁定恢复点永久保留。

## ADR-026 --- 恢复采用维护模式、PRE_RESTORE 与双 Bootstrap 路径

Status: Accepted

已初始化数据库从受认证 API 一键恢复：管理员密码与精确短语双重确认，进入维护模式，创建并
锁定 PRE_RESTORE，校验 SHA-256、PostgreSQL/Schema 兼容性后以单事务
`pg_restore --clean --if-exists` 恢复，再执行 Prisma migrate、健康检查和关键表计数核对；
失败时自动尝试回滚 PRE_RESTORE。数据库存在但无 Schema 时由最小公共恢复 API 接受受恢复
密钥保护的 `.dump`；数据库本身尚不存在时使用同一校验规则的
`scripts/bootstrap-restore.ps1` 创建数据库并恢复，避免完整 NestJS 对目标数据库已存在的启动
前提成为死锁。

## ADR-027 --- 库存页保持单一大表格与单一主操作

Status: Accepted

最终 Product Design QA 继续执行 ADR-012：库存页移除 KPI 卡片墙，把仓库、库存状态、商品类目、
日期与关键字集中在同一工具栏；“发起调拨”是唯一品牌色主操作，期初库存与库存调整归入次级
业务操作菜单。库存余额新增服务端 `categoryId` 过滤并同步 URL。选中行支持鼠标和键盘激活，
右侧上下文栏展示可用量、移动平均成本、地点分布、FIFO 批次和调拨建议；1024/390 像素断点
分别使用图标导航与紧凑移动布局。参考稿与实现已在应用内浏览器同屏比较，最终结果记录于
`design-qa.md`。

## ADR-028 --- 登录预填仅作为私人本机显式配置

Status: Accepted

单用户本地部署允许通过 `web/.env` 中的 `VITE_DEFAULT_LOGIN_USERNAME` 与
`VITE_DEFAULT_LOGIN_PASSWORD` 自动填充已有管理员的登录表单，首次创建管理员仍要求手工输入密码。
该配置不绕过 Argon2id 验证，也不改变 Access/Refresh Token 边界。由于所有 `VITE_` 值都会进入
浏览器端，它不属于密钥存储，只允许在用户确认无人共享的私人电脑上显式配置；共享或可被他人访问的
环境必须留空，迁移到此类环境时删除两项配置并重启前端。

## ADR-029 --- 主数据业务代码允许更正

Status: Accepted

Category、Product、SKU 等主数据的业务代码允许在编辑时更正，并继续受唯一约束保护。业务和关联记录始终保存内部 UUID，因此代码变更不会断开 SKU、库存或单据关联；更新操作复用现有审计日志，保留变更前后的代码。

## ADR-030 --- SKU 条码改为可选字段

Status: Accepted

SKU 代码是系统唯一且必填的交易与库存标识；条码不再作为新增 SKU 的必填输入。数据库保留已有条码，并允许新 SKU 的条码为空；当填写条码时仍保持全局唯一。SKU 与库存查询使用 SKU 代码和名称，不依赖条码。

## ADR-031 --- Ant Design DatePicker 窄例外

Status: Accepted

用户要求所有日期选择统一使用 Ant Design `DatePicker`，且不需要时分秒。为保持既有 Base UI 组件体系，本例外只引入 `antd` 的 `DatePicker` 与其日期依赖；不得使用 Ant Design 的其他组件、布局、通知或全局样式体系。日期字段统一选择并提交 `YYYY-MM-DD`，月份字段使用 `DatePicker` 的月份模式；后端现有 ISO 日期时间契约不变，由前端在提交时完成日期规范化。迁移范围为主数据、库存、采购、销售、质量和财务中的现有原生日期/时间/月输入；不涉及数据库或 API 迁移。

## ADR-032 --- 日期范围直出并使用中文 RangePicker

Status: Accepted

用户要求列表日期范围不再收进“更多筛选”，直接在筛选栏使用中文 Ant Design `DatePicker.RangePicker`。为避免连续更新 URL 时丢失范围一端，列表 URL 状态新增原子日期范围更新；范围仍使用 `createdFrom <= createdAt < createdTo` 的后端半开区间，前端只呈现日期。迁移范围为主数据、库存和质量列表筛选；不涉及数据库或 API 迁移。

## ADR-033 --- DataTable 详情改用受限 Dialog

Status: Accepted

原因：用户希望点击列表“查看详情”后在弹窗内阅读，不再改变表格行高和当前浏览位置。

影响：统一 DataTable 的查看按钮打开使用现有 Base UI Dialog 的可滚动详情区；复杂单据仍维持独立详情页，不改变 API、数据模型或业务规则。

迁移：移除表格行展开状态与样式；原主数据详情渲染器改为 Dialog 内容渲染器，E2E 覆盖弹窗打开和关闭。

## ADR-034 --- 业务代码保留用户大小写

Status: Accepted

原因：用户需要 SKU、产品、地点与资金账户等手工录入的业务代码可区分大小写，不能在保存或导入匹配时自动转为大写。

影响：代码仅去除首尾空格；既有数据库唯一约束继续生效并按 PostgreSQL 默认区分大小写。期初库存导入以相同的精确大小写匹配 SKU 和地点代码；系统自动生成的单据号、枚举和币种格式不受影响。

## ADR-035 --- 采购员不再关联采购渠道

Status: Accepted

原因：采购员仅表示业务负责人，采购渠道由每张采购订单独立选择；两者不再维护主数据层面的多对多关系。

影响：移除采购员表单、列表和 API 的采购渠道字段，删除 `BuyerPurchaseChannel` 关联表。采购订单仍保存采购员和采购渠道两个独立快照，并分别校验其启用状态。

## ADR-036 --- 采购订单在首张收货单前可更正

Status: Accepted

原因：采购订单确认并不产生库存或应付，用户需要在实际收货前更正供应商、采购渠道、采购员、日期和成交明细。

影响：草稿与已确认订单在没有任何收货单时允许整体更新，并写入审计日志；创建首张收货单后，订单及成交快照锁定，避免影响收货、库存和应付追溯。

## ADR-037 --- 移除用户侧文件中心与商品图库

Status: Accepted

原因：当前系统只需要让用户配置 OneDrive 作为备份存储；文件资产列表、通用上传下载、商品图库和业务附件界面会扩大不必要的操作范围。

影响：删除 `/files` 及商品图片相关 API、控制器、前端页面和产品表单图片功能；导航中的“文件中心”改为“系统 → OneDrive 设置”。保留 `FilesService`、`FileAsset`、`FileAssociation` 和 StorageProvider 作为备份模块的内部实现，避免破坏备份、下载、恢复和保留策略。

迁移：不删除历史 `ProductImage` 数据表或数据，现有记录保持只读兼容；后续不再创建该类记录。没有数据库 Migration。

## ADR-038 --- DataTable 默认详情统一结构化展示

Status: Accepted

原因：通用 DataTable 直接枚举行对象会将审计变更、备份 Manifest 等嵌套数据与技术字段名混排，无法阅读。

影响：默认详情统一翻译公共字段和值；标量保持网格展示，嵌套对象和数组改为独立分区。业务页可继续提供专用详情渲染器；审计页隐藏仅用于表格展示的 code、name、status 衍生字段。

## ADR-039 --- 前端统一中文枚举展示

Status: Accepted

原因：数据库与接口中的英文枚举代码直接出现在列表和详情中，增加业务理解成本。

影响：前端统一把库存地点、库存状态、单据状态、资金分类、备份状态等已知枚举展示为中文；接口传参与数据库持久化仍使用原英文代码。未知值保留原值，便于发现未同步的新枚举。

## ADR-040 --- 详情弹窗不展示内部唯一标识

Status: Accepted

原因：业务详情直接枚举接口对象会暴露数据库 UUID、关联外键和幂等键，并让同一单据的业务字段与内部追踪字段混排。

影响：统一详情只取当前列表列和明确的业务扩展字段；UUID、关联外键、幂等键与内部版本号全部隐藏，关联主数据压缩为“业务编号 · 名称”，金额、日期、枚举和文件大小使用面向用户的格式。审计检索仍可在列表筛选中使用实体 ID 或请求 ID，不在详情正文重复展示。

迁移：仅调整前端共享 DataTable 详情渲染和样式，不修改 API、数据库或历史数据。

## ADR-041 --- 页面日期统一精确到日

Status: Accepted

原因：业务操作不需要时分秒，列表、详情和选择器混合展示时间会增加阅读噪音。

影响：前端所有业务日期统一按本地日期展示到日，日期选择继续使用 Ant Design `DatePicker`；月份筛选保持 `YYYY-MM`。API 和数据库仍保留现有时间字段，不做数据迁移。

## ADR-042 --- 日常开销账单复用财务过账内核

Status: Accepted

原因：耗材、资质办理等日常经营支出需要独立账单和分类，但最终仍属于真实资金流出，不应建立第二套余额或汇总逻辑。

影响：日常开销账单复用 `AccountAdjustment` 的草稿、幂等过账和资金流水关系，新增 `ExpenseCategory` 与收款方字段；开销页面与 API 独立呈现，过账统一生成来源为 `EXPENSE_BILL` 的 `OTHER_EXPENSE` 流水。既有调整列表排除日常开销账单，避免重复展示。

## ADR-043 --- 恢复产品图片上传，继续移除通用文件中心

Status: Accepted; supersedes the product-image portion of ADR-037

原因：产品资料需要保存和查看商品实物图片；移除产品图片入口后，用户无法完成该业务录入。

影响：恢复 Product 专用的图片上传、列表、删除和受认证内容读取接口。图片必须经过 `FilesService` 与 `StorageProvider`，仅接受 JPG、PNG、WebP，单张不超过 10 MB、每个产品最多 12 张；首张为主图，缩略图和详情图可放大预览。继续不提供通用文件中心、通用上传下载、业务附件或浏览器直接操作 `FileAsset`。

迁移：复用既有 `ProductImage` 与 `FileAsset` 表，无数据库 Migration；历史图片继续兼容。

## ADR-044 --- 销售订单预创建草稿销售出库单

Status: Accepted

原因：销售订单创建后需要立即在销售出库表格中可见并可处理；但出库地点可能尚未确定，不能为了同步草稿而阻塞订单创建。

影响：每个销售订单明细创建一张草稿 `SalesIssue`，数量和日期初始取订单值；`locationId` 在草稿阶段允许为空，处理并过账前必须填写有效地点。部分出库会自动创建剩余数量的新草稿出库单，保留既有分批出库规则。

迁移：`202607220003_sales_issue_draft_location` 将 `SalesIssue.locationId` 改为可空；历史已创建出库单不受影响。
