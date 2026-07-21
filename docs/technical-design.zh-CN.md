# Vesti 技术设计

[English](technical-design.md) | [简体中文](technical-design.zh-CN.md)

本文档是 Vesti MVP 的开发者参考。产品目标与用户流程见[中文 README](../README.zh-CN.md)，启动步骤见 [operations.zh-CN.md](operations.zh-CN.md)，Solana 程序细节见 [onchain.zh-CN.md](onchain.zh-CN.md)。

## 架构

Vesti 采用分层的 Next.js 应用，并使用独立的 Solana 托管程序：

- `app/` 包含页面和轻量 API 路由处理器。
- `components/` 包含业务组件和共享 UI 组件。
- `lib/validations/` 使用 Zod 解析请求数据。
- `lib/services/` 负责授权、状态转换、持久化和事件创建。
- `lib/domain/` 包含共享领域规则和视图模型辅助函数。
- `lib/blockchain/` 定义托管适配器和 Solana 交易集成。
- `lib/profile/` 包含可复用的头像与参与方展示辅助函数。
- `prisma/` 定义 PostgreSQL 模型、迁移和种子数据。
- `programs/vesti-escrow/` 包含兼容 Anchor 的 Rust 托管程序。
- `scripts/` 包含仓库级任务运行器，不放置应用运行时代码。
- `tests/integration/` 包含跨领域、依赖数据库的工作流测试。
- `types/` 包含应用层共享的 TypeScript 类型。

页面和路由必须通过服务层执行业务行为，不得重复实现角色检查、资金约束或状态转换。

### 目录职责

![Vesti 仓库结构](assets/diagrams/repository-structure.png)

仓库根目录仅保留框架清单、工具配置、环境变量示例和主要文档。单元测试与被测模块放在一起，集成测试位于生产运行时目录之外。`.next/`、`target/`、`node_modules/` 等生成目录，以及本地日志和密钥文件，均由 Git 忽略。

### 仓库根目录

| 文件或文件组 | 位于根目录的职责 |
| --- | --- |
| `README.md`、`README.zh-CN.md` | 产品与系统入口。 |
| `package.json`、`pnpm-lock.yaml`、`.node-version` | Node.js 运行时与依赖定义。 |
| `next.config.mjs`、`next-env.d.ts`、`tsconfig.json` | Next.js 与 TypeScript 配置。 |
| `eslint.config.mjs`、`postcss.config.mjs`、`tailwind.config.ts`、`components.json` | 代码质量和 UI 构建配置。 |
| `prisma.config.ts` | Prisma CLI 入口；结构与迁移仍位于 `prisma/`。 |
| `docker-compose.yml` | 本地 PostgreSQL 服务定义。 |
| `Anchor.toml` | Anchor 工作区和 Solana 部署配置。 |
| `.env.example` | 唯一提交到仓库的环境变量模板。 |
| `vitest.config.ts`、`vitest.integration.config.ts` | 单元测试和集成测试发现规则。 |
| `.editorconfig`、`.gitattributes`、`.gitignore` | 编码、换行符、生成文件、密钥和依赖规则。 |
| `.github/workflows/ci.yml` | Pull Request 与主分支验证流水线。 |

## 技术基线

- Next.js 16、React 19 和 TypeScript
- Tailwind CSS 与可复用 UI 组件
- PostgreSQL 与 Prisma
- Zod 请求校验
- Solana Wallet Adapter 与 `@solana/web3.js`
- Rust、Anchor 与经典 SPL Token Program
- 使用 Vitest 执行单元测试，使用 TypeScript 集成测试运行器验证数据库工作流

Web 交易链路当前仅面向经典 SPL Token Program；Token-2022 支持不在当前 MVP 范围内。

## 领域模型

### 合约生命周期

合约主要使用以下状态：

![合约生命周期](assets/diagrams/contract-lifecycle.png)

- `open`：可接收申请的公开项目。
- `claimed`：已有工作者申请，等待需求方选择。
- `draft`：已分配工作者，但尚未注资。
- `active`：已注资，可以执行里程碑交付。
- `completed`：所有里程碑资金均已释放。
- `cancelled`：草稿合约被取消，或争议合约的剩余托管余额已退款。
- `disputed`：争议解决前阻止正常里程碑流程。

只有需求方可以为合约注资或取消草稿合约。里程碑金额之和必须等于合约总额，已释放金额与已退款金额之和不得超过已注资金额。

### 里程碑生命周期

![里程碑生命周期](assets/diagrams/milestone-lifecycle.png)

只有被分配的工作者可以提交证明。每次提交都会创建新的 `ProofSubmission` 版本，而不是覆盖历史证据。只有需求方可以请求修改、批准证明或释放已批准里程碑的资金。

### 争议

任一参与方都可以对进行中且尚未付款的里程碑发起争议。在 Mock 模式下：

1. 一方提出 `release_to_worker`（释放给工作者）或 `refund_to_creator`（退回需求方）。
2. 另一方接受该提议。
3. 服务执行结算、更新汇总金额并追加事件。

提议方不能接受自己的方案。由于 Solana 程序尚未实现结算指令，链上争议操作会明确失败，不会降级执行。

### 审计与交易记录

`Event` 是只追加的协作时间线。`EscrowTransaction` 记录资金操作意图及进度，包括：

- 操作类型和适配器模式；
- 钱包、合约、里程碑和金额；
- 唯一幂等键和操作键；
- 提交后的唯一交易签名；
- `prepared`、`submitted`、`confirmed`、`reconciled` 或 `failed` 状态；
- 时间戳和失败诊断信息。

注资和付款必须具有幂等性。链上交易确认后，还必须根据预期指令和托管账户状态完成对账，之后才能更新本地金额或状态。

浏览器在提交交易后立即持久化交易签名，并在等待确认前调用 `POST /api/transactions/submit`。即使页面跳转或客户端暂时失败，已提交交易仍可恢复。独立调度的对账任务会租用到期记录、按指数退避重试，并在重试耗尽后标记为需要运营检查；多个任务实例无法同时取得同一租约。

## 认证与授权

正式认证流程使用钱包挑战和签名消息校验。验证后的会话保存在仅限 HTTP 访问的 Cookie 中。存在有效会话时，服务端从会话取得操作钱包，并忽略请求体中的钱包回退值。只有显式开启非生产 Demo 绕过模式时，才允许使用请求体钱包。

钱包挑战通过带条件的数据库更新完成消费，并发验证无法重复使用同一签名。挑战和验证接口同时按钱包以及代理提供的客户端地址执行数据库限流。浏览器 POST 请求携带 `Origin` 时，其来源必须与应用来源一致。

Demo 钱包绕过默认关闭，仅用于明确的本地演示，生产部署不得启用。

授权同时基于角色和状态：

- 需求方操作：接受申请、注资、取消、请求修改、批准和付款。
- 工作者操作：申请项目以及提交证明。
- 参与方操作：评论、发起争议、提出结算方案或接受对方的结算方案。

## API 设计

工作流 API 统一使用 `POST`，包括需要结构化筛选条件的读取接口。实体标识放在 JSON 请求体中，不使用动态 URL 段。资料头像是唯一的 `GET` 接口，因为它直接返回图片字节。

### 认证

```text
POST /api/auth/challenge
POST /api/auth/verify
POST /api/auth/session
POST /api/auth/logout
```

### 合约与协作

```text
POST /api/contracts/create
POST /api/contracts/list
POST /api/contracts/get
POST /api/contracts/claim
POST /api/contracts/accept-claim
POST /api/contracts/fund
POST /api/contracts/cancel
POST /api/contracts/delete
POST /api/contracts/rename
POST /api/contracts/visibility
POST /api/contracts/comments/create
```

### 里程碑与争议

```text
POST /api/milestones/submit-proof
POST /api/milestones/request-revision
POST /api/milestones/approve
POST /api/milestones/release
POST /api/milestones/dispute
POST /api/milestones/propose-dispute-resolution
POST /api/milestones/accept-dispute-resolution
```

### 钱包签名交易

```text
POST /api/transactions/prepare-fund
POST /api/transactions/confirm-fund
POST /api/transactions/prepare-release
POST /api/transactions/confirm-release
POST /api/transactions/submit
```

准备接口为已连接钱包构建 Base64 Solana 交易；提交接口在钱包广播后立即持久化交易签名；确认接口校验已提交指令和最终托管状态，然后对账本地记录。

![钱包签名交易时序](assets/diagrams/wallet-transaction-sequence.png)

### 用户资料

```text
POST /api/profile/update
GET  /api/profile/avatar
```

### 系统

```text
POST /api/health
```

健康检查会验证数据库连接，并返回当前托管模式和网络。每个 API 响应都包含 `x-request-id` 响应头；错误响应体包含同一标识，便于关联日志。

路由处理器只负责解析请求、调用一个服务并将已知错误映射为 HTTP 响应。校验和业务规则必须位于各自的专用层中。

## 托管适配器边界

`ESCROW_ADAPTER_MODE` 用于选择实现：

- `mock`：执行确定性的本地状态变更，并支持双方争议结算。
- `onchain`：依据 Solana 程序准备并对账钱包签名的注资和付款交易。

Web 应用不得从链上模式静默回退到 Mock 行为。不受支持的链上操作必须返回明确错误。

## 配置

本地开发时，将 `.env.example` 复制为 `.env`。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接字符串。 |
| `NEXT_PUBLIC_APP_URL` | 浏览器可见的应用来源地址。 |
| `NEXT_PUBLIC_SOLANA_NETWORK` | 钱包网络，当前为 `devnet`。 |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Solana JSON-RPC 地址。 |
| `NEXT_PUBLIC_USDC_MINT` | 经典 SPL 测试 USDC Mint。 |
| `ESCROW_ADAPTER_MODE` | 默认 `mock`；仅在已配置的 devnet 测试中使用 `onchain`。 |
| `ESCROW_PROGRAM_ID` | 已部署的 Vesti 托管程序地址。 |
| `RECONCILIATION_BATCH_SIZE` | 单次对账任务最多租用的已提交交易数。 |
| `RECONCILIATION_MAX_ATTEMPTS` | 已提交交易进入运营检查前的最大重试次数。 |
| `AUTH_SECRET` | 用于保护钱包会话的服务端密钥。 |
| `DEMO_WALLET_AUTH_ENABLED` | 服务端本地 Demo 绕过开关。 |
| `NEXT_PUBLIC_DEMO_WALLET_AUTH_ENABLED` | 客户端本地 Demo 钱包开关。 |

当前程序标识记录在 [onchain.zh-CN.md](onchain.zh-CN.md)，确保部署相关信息只有一个事实来源。

## 工程规范

- USDC 金额使用 `Decimal`；持久化资金计算不得使用 JavaScript 浮点数。
- 保持 `releasedAmount + refundedAmount <= fundedAmount <= totalAmount` 约束。
- 已付款里程碑不得重复付款。
- 证明提交和事件历史只允许追加。
- 调用外部资金操作前，必须先持久化幂等记录。
- API 处理器保持轻量，并明确返回校验、授权、状态和基础设施错误。
- 在 API 边界保留请求 ID，使生产错误可追踪且不暴露内部细节。
- 数据结构变更必须添加迁移，并同步维护种子数据。
- 未经独立产品决策，不得向 MVP 添加市场、聊天、法币、KYC、法律仲裁、多链、信誉或公开资料功能。

## 开发命令

使用 Node.js 20+ 和 Corepack。

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm lint
corepack pnpm test
corepack pnpm test:integration
corepack pnpm build
corepack pnpm check
corepack pnpm check:full
corepack pnpm reconcile:transactions
corepack pnpm cleanup:operational
corepack pnpm prisma validate
corepack pnpm prisma generate
corepack pnpm prisma migrate dev
corepack pnpm prisma studio
corepack pnpm seed
```

有序的本地启动流程、Docker 数据库命令、演示数据和质量检查步骤见 [operations.zh-CN.md](operations.zh-CN.md)。
