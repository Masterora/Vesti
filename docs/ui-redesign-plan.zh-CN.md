# Vesti 深色界面完整改造方案

基线：2026-09-22，`main`，提交 `b16e72c`。本方案基于当时源码与 `docs/design/vesti-page-framework-v2/` 的 7 张图片；图片确定视觉与布局方向，业务规则以服务层为准。此文记录目标与验收口径；实施进度和测试结果以当前代码及每轮验证报告为准。

## 1. 交付目标与范围

把当前“顶部导航 + 混合合约列表 + 长详情页”改为统一深色工作空间。完成 6 类页面、7 个主要视图：需求方工作台、工作者工作台、我的合约、公开项目、新建合约、合约详情、个人资料。

实施保留 Next.js App Router、React、TypeScript、Tailwind、Prisma/PostgreSQL、现有钱包认证及 Solana 交易适配层。新增少量查询能力，不引入全局状态框架、队列、独立后端、对象存储或新的支付通道。

范围内：页面布局、导航、深色组件、角色视图、聚合查询、分页过滤、详情组件拆分、操作面板、英文/中文、响应式、无障碍、回归验证。

范围外：宣传首页、独立注册系统、评分、消息中心、文件上传系统、申请历史审计、实时聊天、法币、多链、第三方仲裁、链上争议能力、全新的后台管理系统。旧版操作图可参考布局，不新增独立业务页面。移动端适配现有主页面，不另扩产品范围。

## 2. 当前代码与设计差距

| 当前证据 | 已有能力 / 差距 | 修改决定 |
|---|---|---|
| `app/layout.tsx`、`components/layout/app-header.tsx` | 顶部导航，视口声明 light | 改为侧栏 + 顶栏 + 主区；视口声明 dark |
| `app/globals.css`、`tailwind.config.ts` | 浅色变量、页面渐变、1180px 最大宽 | 建立深色语义变量和三种内容宽度 |
| `components/contracts/dashboard-client.tsx` | 公开与个人合约混合，搜索与状态本地 state | 拆工作台、合约列表、公开项目；查询写入 URL |
| `dashboard-summary.tsx` | 统计来自当前返回列表；待处理仅按 claimed/draft/disputed | 聚合基于认证钱包、真实里程碑和可执行任务，不随分页改变 |
| `list-contracts-for-wallet.ts` | 无分页、无当前里程碑、无截止日期、无角色范围筛选 | 新建分页查询与工作台查询，复用授权边界 |
| `get-contract-by-id.ts` | 已有详情及角色脱敏 | 保留公开/参与者边界，补展示能力信息 |
| `contract-detail-client.tsx` | 同时承担加载、交易恢复、签名、表单、详情渲染 | 按查询、操作、交易、视图拆分，保留现有恢复流程 |
| `milestone-workflow.tsx` | 交付、修改、批准、付款、争议均存在 | 分成局部操作区，通过统一角色/状态映射控制 |
| `wallet-provider.tsx`、`wallet-bar.tsx` | 钱包登录、签名、资料编辑集中在顶栏 | Provider 保留；顶栏只保留状态，资料表单迁入新页 |
| `lib/api/client.ts` | fetch 无 AbortSignal，错误主要为字符串 | 补请求取消及可用状态码，区分钱包切换、过期响应与真实错误 |
| `types/contract.ts` | 金额为字符串，但合约/里程碑状态仍为 string | 复用领域状态联合类型，增量扩展查询 DTO |
| `.github/workflows/ci.yml` | lint、单测、数据库集成、构建已配置 | 延续原门禁，补少量关键浏览器流程 |

### 2.1 必须校正的效果图表达

1. **托管余额** = fundedAmount − releasedAmount − refundedAmount。待注资合约余额为 0。旧工作台图把一个待注资项目计入 2,000 USDC 托管余额，不能照搬；真实数据驱动统计。
2. `VT-024` 是图片样例。当前 displayId 是 16 位大写字母数字；保持生成及搜索规则，可展示缩写并复制完整编号，不做编号迁移。
3. 交付数据只有 note、proofUrl、proofHash 与版本。图中的 `.fig`、PDF“附件列表”改成“交付说明 + 交付链接 + 历史版本”，不伪造文件名、下载、上传功能。
4. 公共用户资料目前只有名称、钱包、头像；bio/email 属于会话资料。申请者视图不展示尚未公开的简介，不直接扩大隐私字段。
5. “招募中”合并展示 open、claimed，但需求方要能区分“无申请”和“待选择工作者”；claimed 不等于已选择工作者。
6. 同一钱包可能同时发起和参与合约。角色是合约关系，工作台切换只是任务视角，不是账户权限切换。
7. 选定工作者会删除该合约 applications。最近申请仅表示当前仍存在的申请，不能声称完整历史、拒绝理由或保留落选记录。
8. 私有且未指定工作者的项目，没有现成的邀请接单闭环。新建界面采用“公开招募”或“指定工作者”两种合作方式；后者传现有 workerWallet 参数。旧私有未分配合约提供改为公开的入口，不假设已有邀请功能。
9. Mock 与 Devnet 必须区分。环境标签来自服务端公开运行能力，不根据钱包是否连接猜测；Mock 显示“模拟托管”。
10. Mock 才能发起、提出、接受争议方案。退款分支实际退还 fundedAmount − releasedAmount，并将合约改为 cancelled；不是只退当前里程碑。确认区展示退款影响整个合约。
11. 资料页实际限制：displayName 40 字、email 120 字、bio 280 字；头像沿用当前转换/校验链路。图上的字数及格式说明不能代替代码约束。
12. 图片中的日期、头像首字母、合约样例数量不作为跨页数据规范；验收使用同一组数据库 fixture。颜色与网格统一，业务信息按此文档校准。

## 3. 信息架构与路由

| 主视图 | 路由方案 | 图片 | 访问及布局 |
|---|---|---|---|
| 需求方工作台 | `/dashboard?view=creator` | 01-client-dashboard.png | 已认证；待办主区 + 交付侧栏 |
| 工作者工作台 | `/dashboard?view=worker` | 02-worker-dashboard.png | 已认证；交付队列 + 当前任务侧栏 |
| 我的合约 | `/contracts` | 03-my-contracts.png | 已认证；全宽表格 |
| 公开项目 | `/marketplace` | 04-public-projects.png | 可匿名浏览；列表 + 项目侧栏 |
| 新建合约 | `/contracts/new` | 05-new-contract.png | 已认证；表单 + 金额摘要 |
| 合约详情 | 保留 `/contracts/detail?id=...` | 06-contract-detail.png | 按当前服务端可见性；里程碑主区 + 活动侧栏 |
| 个人资料 | `/settings/profile` | 07-profile.png | 已认证；窄表单 |

图片均位于 `design/vesti-page-framework-v2/`，相对本文件目录解析。

`/` 本轮继续跳到 `/dashboard`，避免改已有入口。匿名工作台显示原位连接入口及“浏览公开项目”，不渲染假个人数据。认证加载期间用骨架，不能把“尚未恢复会话”当匿名并来回跳转。连接完成恢复合法的站内目标操作；未登录就直接打开新建页时保留页面上下文。

侧栏只有工作台、我的合约、公开项目；新建合约是操作按钮，个人资料放账户菜单。两个工作台视图在标题区以“我发起的 / 我参与的”切换，使用 query 参数；不在侧栏重复增加两个首页。

### 3.1 页面状态与 URL

- `/contracts?relation=created&status=active&q=...&visibility=private&page=2&sort=updated_desc`。
- `/marketplace?q=...&tag=...&page=2&project=<id>`；project 控制当前预览，不建立另一份详情页面。
- `/dashboard?view=creator&contract=<id>&milestone=<id>`；刷新可还原侧栏，服务端仍校验权限。
- `/contracts/detail?id=...&tab=milestones&milestone=...`；tab 枚举 overview/milestones/deliveries/applicants/discussion/activity，争议区在有争议时出现。
- 筛选使用 replace，进入实体页面用 push；返回恢复筛选和页码。搜索防抖 250ms，筛选变化将页码复位。
- 表单内容、钱包签名材料、邮件、交付说明不放 URL。新增 query 值先校验，未知值回落默认，不触发敏感操作。

## 4. 视觉系统及通用交互

### 4.1 颜色与基础样式

| 语义 | 初始目标值 | 用途 |
|---|---|---|
| background | #17191C | 主画布 |
| sidebar | #141619 | 全局导航 |
| surface | #1C1F23 | 输入、局部操作区 |
| surface-raised | #23272D | 弹层 |
| selected | #272F37 | 当前行 |
| border | #34383E | 细分隔 |
| foreground | #ECEEF0 | 正文及金额 |
| muted-foreground | #A5ADB7 | 次级信息 |
| primary | #486782 | 主操作背景 |
| primary-foreground | #FFFFFF | 主按钮文字 |
| link / focus | #8EC5F0 | 链接及焦点 |
| success / warning / danger | #69C69A / #EAC16B / #EF9292 | 状态文字与图标 |

最终值以浏览器对比度检查为准：正文至少 4.5:1，交互边界/图标至少 3:1。状态同时有文字，不能只靠圆点。沿用 CSS 变量驱动 Tailwind，统一 danger 命名；修正 `escrow-transaction-status.tsx` 使用未声明的 text-destructive 的问题。

字体使用现有系统字体加中文回退；不新增在线字体依赖。标题 28/32px，区块标题 18/24px，正文 14/22px，辅助 12/18px；窄屏表单正文可用 16px。金额采用等宽数字。间距 4/8/12/16/24/32；圆角 6px；不使用大阴影、背景渐变或发光。

替换所有页面内固定 bg-white、浅色状态块及彩色硬编码，不能只改根变量。品牌沿用现有 brand-mark，提供深色可读版本，不把图中生成的 V 图形当正式新品牌替换。

### 4.2 网格与响应式

- ≥1440px：侧栏 216px、顶栏 56px、内容边距 24–32px；上下文栏 360–400px，主区 min-width:0。
- 1024–1439px：侧栏 184px；只有主区宽度足够时双列；否则详情栏改抽屉，表格保持主要字段。
- 768–1023px：侧栏收为菜单，主区单列；详情使用可关闭抽屉，恢复触发按钮焦点。
- <768px：表格转换为项目行/卡片，金额、状态、下一步优先；不让整个页面横向滚动。里程碑表单纵向排列，摘要移到表单末尾。
- 全宽列表不受原 page-shell 1180px 限制；表单最大 1120px，资料内容最大 720px。主区只保留一处主要滚动容器。
- 为 375、768、1024、1440、1920px 检查布局。此项是同一页面的适配，不再生成小变化图片。

### 4.3 通用组件

新增小型、受控、语义化的 PageHeader、StatusLabel、Tabs、Table、EmptyState、InlineNotice、ContextPanel、Dialog、FormField。避免自建通用表格引擎或复杂 schema 表单。

桌面 ContextPanel 可为非模态 aside，移动端转换为模态 Dialog；不能对普通侧栏错误地施加焦点锁。模态首选原生 dialog 封装，支持 ESC、初始焦点、关闭后焦点恢复、背景不可交互与滚动锁。破坏性/资金动作需明确确认；普通筛选不弹确认。

按钮提供 loading 状态、可见 focus-visible、明确的 disabled 原因；输入使用真实 label、aria-invalid 和关联错误。表格行主要跳转使用可聚焦链接，行内菜单不能嵌套链接。图标按钮提供名称，触控区域 ≥44px。

## 5. 七个主视图的详细修改

### 5.1 需求方工作台

优先回答“现在需要我做什么”。从混合列表改为个人聚合：顶部简洁统计、待我处理列表、近期合约，右侧只在选中任务时展示上下文。

待办类型：选择工作者、注资、验收、释放已批准付款、回应对方争议方案。普通进行中合约不算待办；仅等待别人响应也不算。争议待回应与验收置前，再按任务发生时间升序排列，保持稳定 id 次序。一个争议中的合约暂停普通里程碑待办。

每行包含合约、里程碑、金额、时间与准确动作。验收通过后更新为“发起付款”，绝不自动释放资金。侧栏复用详情页的交付预览和动作，不复制一份资金流程。

统计口径：进行中为本人创建且 active 的合约数；待我处理为可执行任务数；托管中为本人创建合约余额之和，包括 disputed 冻结金额。待办列表仅展示前 10 条，统计必须覆盖全部；提供查看全部入口。

验收：只有 submitted 里程碑可以批准/退回；claimed 会显示选人任务；自己的申请不出现在需求方待办；搜索近期合约不会改变顶部统计。

### 5.2 工作者工作台

按待交付、等待反馈、当前申请分区，右侧显示当前任务的范围、截止日期、最新修改意见和交付历史。与需求方的操作目标不同，但共用页面壳及任务组件。

待交付：本人为 worker，合约 active，里程碑 ready 或 revision_requested；有截止日期的按到期日升序，无截止日期放后。不得把 pending 后续里程碑当可提交任务。

等待反馈：submitted 为待验收，approved 为待付款，两个阶段文案不同；仍属于等待，不提供需求方操作。当前申请只查仍存在且尚未选人的 applications；不显示虚构“申请被拒绝”。

本月已收款：本人为 worker、milestone.releasedAt 落在明确日历月范围的 released 里程碑金额之和；不使用所有历史 releasedAmount。首版以 UTC 月作为统一统计口径并显示范围，前端不按设备时区自行重算；后续若做账户时区再统一迁移。

修改意见来自 milestone_revision_requested 事件 payload.note，按 milestoneId 与时间取最新，类型校验后展示。不是读取最新任意评论。

验收：同一钱包切换两个工作视图，数据互不串用；断开钱包立即清空个人数据；到期日缺失可正常展示；没有相关任务显示原位空状态和浏览公开项目入口。

### 5.3 我的合约

全宽表格；列为合约/合作方/当前里程碑/总金额/托管余额/状态/更新时间。次级钱包与编号可复制；长名称单行省略并可展开，金额列不换行。

角色筛选：全部=自己创建或已被选为工作者；我发起的=creator；我参与的=worker。仅申请但尚未选中的项目出现在工作者工作台的当前申请，不混入执行合约。可新增对应入口但不新建页面。

状态集合：招募中(open+claimed)、待注资(draft)、进行中(active)、争议中(disputed)、已完成(completed)、已取消(cancelled)。图中缺少已取消，实施放入“更多状态”，仍可搜索与查看。

当前里程碑：active 取首个未 released 的里程碑；disputed 优先争议里程碑；招募/待注资显示里程碑数量及待启动；completed 显示全部完成；cancelled 显示已取消而非错误显示可执行任务。

每页 20 条，上限 50；默认 updatedAt desc, id desc。分页计数由服务端返回，不再对当前页做全量统计；角色/搜索/可见范围影响所有状态计数，当前状态筛选不影响各状态分组数。

没有批量注资、批量付款、批量删除。行菜单只提供服务端当前允许的操作。删后回列表保持条件，最后一页删空时退回上一有效页。

### 5.4 公开项目

仅呈现公开且 open/claimed 的项目，默认最近更新。匿名可以浏览；申请前要求签名登录，认证恢复后由用户再次明确执行申请，不自动提交。

卡片/行展示名称、标签、需求方公开资料、总额、里程碑数。预览侧栏通过现有受权限保护的详情查询加载；不为每一行请求完整详情。

搜索维持名称、编号、标签；图片“搜索需求方”不实现。分类使用现有 tags，不增加未经定义的固定行业分类。无标签时不画占位标签。

申请提交成功后刷新当前项目与当前申请区；自己发布的项目展示管理入口；已申请展示等待选择；项目被别人选定后从市场移除，已打开侧栏刷新并显示当前不可申请状态。

验收：匿名数据不带交付、评论、全部申请人、私有资料；通过篡改 project query 不可读取私有详情。公开合约在非招募状态的直接链接是否可见，沿用当前 get-contract-by-id 的规则，不因市场收录范围改变访问策略。

### 5.5 新建合约

左侧分为项目信息、合作方式、里程碑；右侧显示总额与里程碑合计。保留显式 totalAmount 输入及逐项金额输入，避免图片只有合计而无法指定总额。

合作方式：公开招募不传 workerWallet；指定工作者显示钱包输入，传现有 workerWallet 并默认私有。禁止选择自己。服务端已有指定工作者直建 draft 的能力，不引入“对方接受邀请”新状态。

新 UI 不允许创建未指定对象的私有招募项目；既有此类数据继续能查看并修改可见性。这个限制先是创建表单产品约束，是否同步收紧 API 另作兼容评审，不能顺手拒绝原有合法调用。

里程碑最少 1 个；名称、说明、正数金额、可选日期；金额最多 6 位小数。合计必须精确等于 totalAmount；差额在摘要显示。日期按纯日期处理，与当前服务端 UTC 存储约定对齐，避免时区导致前一天。

标签去重、最多 8 个、每个最多 24 字，保持现有小写规范。图中标题字数示意不直接引入 100 字规则；当前 rename 上限 120，与 create 校验对齐如需修改须在前后端同时定义。

提交前验证并滚动到首个错误；提交期间禁重复；失败保留草稿。本轮草稿只在当前页面内存保留，离开时如有编辑给确认，不悄悄持久化敏感说明到浏览器。

创建成功进入现有 detail 路由。创建不自动注资。默认不重排里程碑；添加/删除保留稳定客户端 key，避免输入错位。

### 5.6 合约详情：所有履约操作的统一容器

顶部：合约名称、完整编号复制、合约状态、参与方、总额/已付款/已退款/托管余额。与金额无关的管理操作收进更多菜单。

中部标签：概览、里程碑、交付记录、申请者（仅有权限时）、讨论、活动。已执行合约默认里程碑；招募中默认概览或申请者。不为标签新增路由文件。

里程碑列表：只默认展开当前可处理项，完成项收起；展示真实标题、范围、金额、日期、状态。右侧近期活动只是摘要，完整活动标签支持浏览；不在两处重复整个讨论列表。

局部动作：

| 场景 | 展示方式 | 行为 |
|---|---|---|
| 申请者管理 | 标签内列表 + 资料侧栏 | 名称/头像/钱包/申请时间；选择后进入待注资 |
| 注资 | 金额确认 Dialog | 展示全额、对象、模式；点击确认后才 prepare/sign |
| 提交交付 | 当前里程碑表单或 ContextPanel | note 必填、proofUrl 可选；保留历史版本 |
| 请求修改 | 说明输入面板 | note 必填，成功转 revision_requested |
| 批准交付 | 交付区明确按钮 | 仅批准；返回最新状态后出现付款入口 |
| 释放付款 | 独立确认 Dialog | 明确收款方、金额、释放后余额，钱包再次确认 |
| 争议 | 详情内争议区 | 发起说明、提出方案、等待对方、接受方案 |
| 名称/可见范围 | 小型编辑弹窗/控件 | 按当前服务允许的状态执行 |
| 取消/删除 | 更多菜单 + 确认 Dialog | 展示对象及影响，避免进入详情就出现大红色操作区 |

争议特别规则：Mock 的释放方案只释放争议里程碑；退款方案退还剩余未付托管并取消整个合约。提出者只显示等待，另一方可接受；接受区不能改金额或先切换结果再直接结算。链上模式发起、提案、接受入口均禁用并说明能力边界。不得新增“第三方仲裁中”。

详情刷新与乐观更新：评论可以先显示“发送中”但失败可重试；资金/批准/选择工作者的业务状态只在服务返回成功后更新。完成操作后刷新扩展详情，不把缺少 comments/events 的局部 mutation 返回当作完整快照覆盖所有区块。

### 5.7 个人资料

抽出 wallet-bar 中的头像处理与 profileDraft 表单，放入 `ProfileForm`；继续调用 WalletProvider.updateProfile 与现有 API。顶栏钱包条只显示连接、账户菜单、网络/模式、错误简讯。

字段使用服务端实际限制；显示名称与头像变更同步顶栏、侧栏及本会话缓存。公共资料缓存刷新不包含 email/bio。断开钱包清空私有页面查询缓存，不使浏览器后退看到上个钱包的数据。

保留现有头像存储格式和转换流程，先不更改上传契约；无头像可采用中性首字母回退，已有头像不删除。若取消像素化转换，应单列素材处理任务与回归，不混入路由重构。

## 6. 读接口和数据设计

### 6.1 API 改造策略

新增独立 read API，旧 `/api/contracts/list` 暂时保持原数组响应，避免一边拆页面一边改变全部调用者。全部新接口沿用 handleRoute、输入校验、同源请求规则、认证会话解析和 data/error 响应封装。

| 接口（POST） | 请求 | 响应 / 约束 |
|---|---|---|
| `/api/contracts/query` | relation、statusGroup、query、visibility、sort、page、pageSize | items、total、page、pageSize、statusCounts；必须认证，钱包从 session 取 |
| `/api/marketplace/query` | query、tag、sort、page、pageSize | 同类分页结构，仅公开招募；匿名可读，登录可补自身申请状态 |
| `/api/dashboard/overview` | view、taskLimit、taskOffset | summary、tasks、waiting、applications、recentContracts、totalTasks、generatedAt；必须认证 |
| `/api/runtime/public-config` | 空 | escrowMode、network、canOpenDispute、canSettleDispute；只暴露展示所需非敏感配置 |
| `/api/contracts/get` | 保留 contractId、认证解析 | 保留现有脱敏，补 viewerRole、capabilities 的只读元信息 |

page>=1，pageSize 默认20、最大50；taskLimit 默认10、最大50；view/relation/status/sort 使用枚举，query 沿用最大80。市场只允许固定排序选项，不能把客户端传入字段直接作为数据库 orderBy。

身份不能由 query/body 任意钱包指定。客户端 view 不能放宽权限；所有新接口在服务端先确定 wallet 和范围，再应用搜索过滤。市场匿名与认证响应有差异，不在公共缓存中混用。

### 6.2 新增 DTO

`ContractSummary` 复用现有列表字段，新增 relation、escrowBalance、currentMilestone（id/index/title/status/amount/dueAt，或 null）、pendingApplicantCount（仅创建者）、nextAction（类型和对象 id）。不把全部 proof/event 列表塞进表格返回。

`DashboardTask` 包括 id（type+contractId+milestoneId）、type、contractId、displayId、title、milestoneId、milestoneTitle、amount、dueAt、occurredAt、counterpartyPublicProfile、target。金额继续 string，时间 ISO；动作类型为 select_worker/fund/review/release/submit/revise/respond_dispute。

`DashboardSummary` 明确字段口径，不使用泛化的 value 数组掩盖统计含义。creator 包含 activeContractsCount/actionableTasksCount/escrowBalance；worker 包含 deliverableCount/waitingReviewCount/receivedThisMonth/monthStart/monthEnd。

`capabilities` 只帮助前端展示，绝不替代 mutation 的现有校验；在通用权限函数中计算基本规则，任何并发变化仍由写服务最终拒绝。金额、收款方、状态不得直接信任客户端。

### 6.3 查询实现与性能

新建 `lib/services/queries/`，在同一服务层使用 Prisma 的字段投影与分页，不由 API Route 直接拼业务查询。

- 列表采用分页后的合约和当前里程碑摘要查询；可以按页批量加载 milestones 再按规则挑选，不做每行一个 HTTP/数据库查询。
- 工作台待办按状态与参与关系在数据库端筛选；summary 使用独立 count/aggregate。不要取所有详情到浏览器再过滤。
- 需要最新修改意见时仅对本页涉及的 milestoneId 批量查相关事件，校验 payload；无事件时显示“未提供修改说明”。
- 资料继续通过 getPublicUserProfilesByWallets 批量获取；不会因为图片有 bio 就查询公开返回 email/bio。
- 总数与 rows 使用同一查询条件；需要严格一致时放入短事务的相同快照。默认 offset 分页便于页码 UI，稳定次序为 updatedAt desc,id desc；并发更新可能移动行，刷新后正常重定位，不声称绝对快照分页。
- 详情初期沿用现有完整读取，避免同时重写交易快照。长评论/事件列表采用视觉分段；数据量证实需要时再拆分页读取，不能把“前端只画20条”称作数据库已分页。
- 首版不新增业务表。若 explain/代表性数据表明慢，再评估 Contract(creatorWallet,updatedAt,id)、Contract(workerWallet,updatedAt,id)、Contract(isPublic,status,updatedAt,id)、Milestone(contractId,index/status) 索引；确认计划再生成单独 Prisma migration。

### 6.4 金额与时间

复用 `lib/domain/amount.ts` 的 BigInt 精确换算；新增有边界检查的余额减法。服务端用 Prisma.Decimal 聚合，DTO 字符串。严禁使用 JS 浮点计算合计、余额和付款比较。

当前 formatUsdc 会 Number(value) 并加 `$`；新格式为 `1,200 USDC`。补字符串/整数单位驱动的安全格式化，至少覆盖数据库 Decimal(18,6) 的可表达范围，展示舍入规则统一。非法金额显示“金额不可用”并禁资金操作，不伪装成 0；负余额作为数据异常处理，不用 max(0) 掩盖。

截止日期按日历日展示；事件时间按明确时区格式化；月度统计边界由服务器返回。时间相对文案提供绝对时间可查看，避免生成图中的“今天”成为静态文本。

## 7. 权限与状态矩阵

| 动作 | 身份 | 服务条件（必须保留） |
|---|---|---|
| 申请 | 非创建者且已认证 | public，open/claimed，未申请 |
| 选择工作者 | creator | claimed，申请人存在 |
| 注资 | creator | draft，合法工作者，按现有 prepare/fund 服务校验 |
| 提交/重新交付 | worker | active + ready/revision_requested |
| 批准 / 请求修改 | creator | active + submitted |
| 释放 | creator | active + approved，并通过现有交易服务条件 |
| 发起争议 | creator/worker | mock + active + ready/submitted/revision_requested/approved |
| 提出方案 | creator/worker | mock + disputed + dispute 未 resolved |
| 接受方案 | 另一参与方 | mock + proposed，不能接受自己提出的方案 |
| 修改名称 | creator | open/claimed/draft/active/disputed |
| 修改可见性 | creator | 沿用当前服务校验，不能由新 UI 擅自增加状态限制 |
| 取消 | creator | 仅 draft；不能把 open 项目取消当现有能力 |
| 删除 | creator | open/claimed 且无 worker；不是软归档 |
| 修改资料 | 当前会话用户 | 认证通过，沿用 profile schema |

前端所有角色计算复用 getContractRole，包含 requestedWorkerWallet 的 applicant 兼容分支。不要继续在不同组件用简化的 wallet==creator/worker 规则散落判断。

状态文案统一：open 招募中；claimed 待选择工作者（市场仍归招募中）；draft 待注资；active 进行中；completed 已完成；cancelled 已取消；disputed 争议中。里程碑独立表达 pending 未开始、ready 待交付、submitted 待验收、revision_requested 需修改、approved 待付款、released 已付款、disputed 争议中。

## 8. 交易流程与前端状态管理

提取 `useEscrowAction` 与 pending-submissions 存储模块，迁移行为而不是重新写一条资金流程。保留 prepare → 钱包签名发送 → 持久化 txSig → confirm → reconcile 后更新业务快照，以及旧单项 localStorage key 的兼容读取。

确认面板是进入流程前的只读摘要；打开面板不生成交易，点击确认才执行。Mock 根据 prepared.canUseDirectAction 使用已有 direct API，不能假装唤起钱包或展示链上签名。

`prepared` 显示待签名，`submitted` 显示已发送待确认，`confirmed` 显示已确认待同步，`reconciled` 才显示业务已更新；`failed` 显示失败原因与适用恢复路径。requiresReviewAt 单独显示待核查，不自动再发款。

有 txSig 的超时/网络断开：恢复确认而非直接创建新交易。相同逻辑重试保持 transactionId/签名；不能每次重试无条件新建 idempotencyKey。无 txSig 的 prepared 先复用仍有效的原交易。注资只有区块哈希已失效、准备记录写入至少 5 分钟且 finalized 链上托管账户不存在时，才释放旧操作锁并重新准备；付款则要求同样的过期与终局等待，并核实 finalized 托管账户的累计已付款金额仍等于本地记录。链上状态不一致或 RPC 检查失败时保持阻塞，进入人工核查或等待重试。恢复完成前禁止同一对象重复资金操作。

钱包切换后：取消旧读取、清空旧详情/表单/错误；pending 项按 walletAddress+contractId+transactionId 隔离。旧异步结果必须验证 request generation 和钱包身份，不能覆盖新账户视图。移入全局壳的恢复器只对匹配当前认证钱包的记录恢复确认，不擅自签名。

普通读请求使用 AbortController；postJson 新增 options.signal，默认保持兼容。变更请求不假设 abort 能撤销服务端操作；页面离开后依靠重新读取恢复结果。

不引入全局数据状态库：独立查询 hooks + 受控页面 state 足够。共同失效事件包含 wallet 与实体 id；资金成功使详情、相关列表、工作台失效，资料成功更新当前 session profile。为未开始的网络请求去重，拒绝手写无限轮询；待确认状态可按2/5/10秒递增轮询、前台运行、超时后提示手动刷新，服务端 reconciliation 仍是事实来源。

## 9. 文件级实施清单

以下新增名称为实施建议，不要求机械拆成过多文件；一项保持单一职责，页面专用小组件优先就近定义。

| 文件 / 区域 | 修改内容 |
|---|---|
| `app/layout.tsx` | Provider 顺序保留，接入 AppShell、dark viewport、公共运行配置 |
| `app/globals.css`、`tailwind.config.ts` | 深色变量、布局宽度、焦点、滚动、语义颜色 |
| `components/layout/app-header.tsx` | 收缩为 WorkspaceHeader；移除副标语与重复导航 |
| 新 `components/layout/app-shell.tsx`、`app-sidebar.tsx` | 响应式导航、账户入口、工作空间主区 |
| `components/ui/{button,input,card,badge,profile-avatar}.tsx` | 移除浅色硬编码、语义状态、loading/focus/label |
| 新 `components/ui/{dialog,tabs,context-panel,empty-state}.tsx` | 通用交互原语 |
| `app/dashboard/page.tsx`、现 dashboard-client/summary | 参数入口；拆 creator/worker 视图与任务摘要 |
| 新 `components/dashboard/` | 工作台查询 hook、任务行、两种主体布局 |
| 新 `app/contracts/page.tsx`、`components/contracts/contracts-page-client.tsx` | 分页表格、筛选、URL状态 |
| `components/contracts/contract-list.tsx` | 拆明确的 ContractTable 与市场列表，迁移完成后去除旧混合列表 |
| 新 `app/marketplace/page.tsx`、`components/marketplace/` | 公开项目查询、预览、申请 |
| `app/contracts/new/page.tsx`、`new-contract-form.tsx` | 新框架、合作方式、worker 输入、稳定里程碑字段 |
| `contract-detail-client.tsx` | 收敛为页面编排与当前选择 |
| 新 `components/contracts/{contract-overview,contract-milestones,contract-applicants,delivery-panel,escrow-confirm-dialog}.tsx` | 详情区块和操作面板 |
| `milestone-workflow.tsx`、`dispute-resolution-panel.tsx` | 保留业务入口，重组局部表单与准确能力限制 |
| `contract-discussion.tsx`、`components/timeline/event-timeline.tsx` | 暗色紧凑布局、版本与绝对时间 |
| `escrow-transaction-status.tsx` | 用户可理解状态与恢复动作、错误语义色 |
| 新 `lib/client/pending-escrow-submissions.ts`、交易 hook | 原存储兼容、钱包隔离、重试恢复 |
| 新 `app/settings/profile/page.tsx`、`components/profile/profile-form.tsx` | 从 wallet-bar 迁出资料表单 |
| `wallet-bar.tsx`、`wallet-provider.tsx` | 精简顶栏；明确会话 loading；保留认证/签名/头像链路 |
| `lib/services/queries/`、新读 API routes | 上述分页与聚合查询 |
| `lib/services/serialize.ts`、`types/contract.ts`、新 `types/dashboard.ts` | 状态收紧、摘要 DTO、能力返回 |
| `lib/validations/contract.ts`、新查询 schema | 状态分组、分页、排序、查询参数约束 |
| `lib/domain/` | 展示状态、任务选择、余额计算公共函数；不替代写服务 |
| `lib/api/client.ts` | abort、错误状态识别和请求兼容 |
| `lib/i18n/messages.ts`、`error-messages.ts` | workspace/dashboard/contracts/marketplace/profile 文案同步双语 |
| `lib/utils.ts` | 安全金额展示与日期约定，编号规则不变 |
| `prisma/schema.prisma` | 默认不改表；仅在性能证据支持时补索引 |
| `tests/`、`.github/workflows/ci.yml` | 新查询/权限/交易恢复回归与必要浏览器流程 |

迁移期保留旧组件，直到新页面不再引用；随后删除废弃实现。不要先整体删除旧详情客户端再重写交易。禁止为满足截图加入硬编码金额、假用户数据或只切换 CSS 就声称完成页面改造。

## 10. 实施顺序与可交付切片

| 阶段 | 具体产物 | 退出标准 | 预估工作量* |
|---|---|---|---|
| 0 基线 | 建 feature/ui-workspace 分支；记录路由/行为、运行现有检查；统一 fixture | 已知已有失败与变更引入失败可区分 | 0.5–1人日 |
| 1 基础框架 | 深色 tokens、AppShell、导航、公共组件；旧页面可用 | 所有现有页面可进入，无浅底残留、无横向溢出 | 1–2人日 |
| 2 查询与列表 | query DTO、分页权限测试、我的合约、公开项目 | 私有范围正确、统计/分页正确、公开申请可用 | 2–3人日 |
| 3 详情及交易 | 拆详情、操作面板、恢复 hook、能力信息 | 现有端到端 Mock 流程及交易恢复无回归 | 2–3人日 |
| 4 工作台 | 两种角色视图、待办聚合、侧栏复用 | 待办/余额/截止日期与详情一致 | 1.5–2.5人日 |
| 5 表单与资料 | 新建合作方式、里程碑编辑、资料迁出顶栏 | 创建→选人/指定→注资路径闭合；资料更新同步 | 1–2人日 |
| 6 验收收尾 | 响应式、双语、a11y、流程回归、文档、删除旧代码 | 下节清单通过，记录真实验证边界 | 1.5–2人日 |

*合计约9.5–15.5人日，是基于当前静态阅读的规划区间，不是已实测承诺；钱包浏览器环境、既有失败和真实链上配置可能影响时间。按阶段分别提交，每个阶段可审查、可回退。第4阶段依赖第2/3阶段；第5阶段资料部分依赖第1阶段，新建部分在第3阶段详情稳定后接入。

首个实施切片建议完成“深色 AppShell + 我的合约分页列表”，用真实数据证明导航、密度、权限与查询正确，再扩展详情。阶段1结束只代表框架完成，不代表全部页面完成。

## 11. 验收与测试设计

### 11.1 必要自动化

| 层级 | 必须验证的行为 |
|---|---|
| 单元 | 6位小数余额/累计/大金额展示；currentMilestone 选择；状态分组；任务派生；截止日与月边界；事件 payload 缺失 |
| 查询集成 | creator/worker/applicant/viewer/匿名范围；伪造钱包无效；私有不能通过市场参数泄露；分页 total/statusCounts；同时间排序；已取消；同钱包双角色 |
| 操作回归 | 创建公开→申请→选择→注资→交付→修改→重新交付→批准→释放；后续里程碑依次推进；重复付款幂等；并发释放 |
| 争议回归 | 本人提案不能自己接受；释放当前里程碑；退款剩余并取消；onchain 发起/提案/接受全部禁用 |
| 前端恢复 | 快速筛选旧响应被忽略；钱包切换旧数据清除；页面刷新后恢复已广播交易；超时不重发资金；失败保留表单 |
| 浏览器 | 七视图入口、详情深链接、返回筛选、Dialog键盘与焦点、手机导航、双语长文字 |

不为颜色类名或纯装饰写镜像单元测试。当前没有浏览器测试依赖，可在实现阶段加 Playwright 作为开发依赖和独立 test:e2e 脚本；先覆盖登录态夹具下的合约主流程、角色切换和资金确认面板。不能用绕过身份校验的夹具替代 API 权限测试。

已存在测试位于 `tests/integration/escrow-workflow.integration.test.ts`、`operational-hardening.integration.test.ts` 及 `lib/**/*.test.ts`。沿用现有 `pnpm check` 与 `pnpm test:integration` 门禁，增加针对新查询的用例，而不是另造不关联领域的演示测试。

注意当前集成脚本会 DROP/重建 `vesti_integration_test` schema。必须在专用测试数据库执行并避免并行跑同一 schema；不要把共享远程服务当默认可写测试环境。本次方案工作不连接或修改远程数据库。

### 11.2 视觉与产品验收

- 七张主框架一一对应运行页面；使用固定测试账户/数据截图，与设计图检查导航、栏宽、字号、间距、金额对齐和动作层级。
- 375/768/1024/1440/1920px 无页面级横向溢出、遮挡；长合约名、长钱包地址、6位小数、空列表均可读。
- 中文/英文完整切换；无开发字段名、原始异常堆栈、原始 submitted/reconciled 状态裸露。
- 键盘能够打开列表项、关闭面板、切换标签、定位错误；焦点可见且返回原触发点。
- 需求方与工作者动作不会互相出现；未认证不显示上一用户资料或个人统计。
- 页面没有“钱包确认成功=付款已完成”的错误提示；Mock/Devnet区别始终明确。
- 不存在生成图带来的假附件、假申请历史、退款范围错误或未实现的仲裁入口。
- 仅对这轮增量所需范围测性能；代表性数据下记录读 API 延迟、查询数量与加载体验，不提前声称达成未测指标。

### 11.3 实施完成后的报告要求

分别报告：代码修改范围、已跑命令及结果、浏览器实际覆盖页面、Mock闭环、Devnet实测情况、未验证边界。Mock回归和截图匹配均不等于链上生产就绪。未部署、不发 PR、不运行远程迁移，除非后续实施任务明确包含这些交付动作。

## 12. 风险与回退

最高风险是拆详情时丢失 pending transaction 恢复、扩大查询可见范围、金额统计误算、把生成图暗示当业务能力。对应措施是先锁测试、增量 DTO、复用会话边界与金额函数、逐阶段迁移。

旧 read API 在新页面全部迁移前保留，新增 read API 不改变资金状态。每阶段独立提交，可按提交回退页面；没有业务表迁移时不涉及数据回滚。若后续补索引，单列 migration 与验证，回滚 UI 不删除数据。

本方案已把图片、当前实现和拟新增能力分开：图片决定视觉骨架，领域服务决定权限与资金语义，新增查询支撑工作台和列表。后续实施以本文件为范围基准，不再为弹窗、颜色或细微状态变化扩张主页面数量。
