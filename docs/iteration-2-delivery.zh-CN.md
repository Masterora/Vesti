# 迭代 2：Web 链上争议闭环交付记录

本轮实现双方协商与独立仲裁两种策略的 Web 链上争议流程，包括发起、提议、接受、放款和退款。验收范围为本地 Solana 验证器、真实 PostgreSQL 和 Chromium 页面；浏览器钱包提供器使用临时 Ed25519 密钥签名，尚未代表 Phantom/Solflare 扩展兼容性或 Devnet 验收。

## 实现

- fund、release 与六种争议动作共用持久化交易协议：building → prepared → signed → submitted/confirmed → reconciled。原始签名消息在广播前保存；刷新、关闭页面和后台重启后重放同一字节，不重新签名。
- 合约行锁、业务版本、逻辑操作与不可变重试 attempt、构建期限和后台租约共同防止重复投影、并发业务覆盖及晚到构建器发布。
- finalized 历史重放核对指令、钱包、账户、Mint、经典 SPL Token 转账、Receipt、Dispute 与 F/R/Q 本金账本；金库额外 Token 独立记录，不进入争议退款本金。
- 直接链上操作可映射时同步进本地；未知里程碑、缺失历史或账户不符进入 review，RPC 暂时失败进入 degraded。合约状态不确定时阻止后续业务写入。
- 页面展示待确认交易、结算金额及收款钱包，支持重新同步和恢复；仲裁钱包的数据视图限制为对应争议及自身交易。
- 能力开关默认关闭。争议入口仅在 localnet、显式开关、批准的 genesis hash、程序代码 hash 和六位小数经典 SPL Mint 全部核验后开启。
- 新初始化采用绑定 Creator 的 v2 PDA，并原子提交最多 8 项固定里程碑计划，拒绝未知里程碑和部分里程碑付款；旧账户布局和签名种子兼容，已有资金仍可付款、退款。
- 头像写入和读取均解码并重编码 PNG，拒绝 SVG 和伪装图片；认证钱包预算仅在有效签名后消费。Mock 协商绑定提案版本和结果，并保留结算后的精确幂等重试。
- 无关 legacy/v0 捐赠、其他 escrow 的附加地址引用和未分配 PDA 预充值不再导致误判。交易恢复校验原链身份，重试上限生效，原签名者可在重新证明 finalized 状态后恢复调度。

主要代码：`lib/blockchain/chain-protocol.ts`、`chain-history.ts`、`lib/services/transactions/chain-operations.ts`、`chain-sync.ts`、`components/contracts/contract-detail-client.tsx`。

新接口为 POST `/api/transactions/{prepare-dispute,record-signed,status,resume,confirm-dispute,chain-sync}`。现有注资、付款准备及确认接口保留；确认未 finalized 时返回 202。具体配置、恢复命令和 review 排查见[运维说明](operations.zh-CN.md)。

## 验收

| 检查 | 证据 |
| --- | --- |
| Prisma、ESLint、单元测试、生产构建 | `pnpm check` 通过；最终 `pnpm test`：21 个文件，76 个测试 |
| Mock 业务、合约锁、旧数据迁移及安全回归 | `pnpm test:integration`：5 个文件，20 个测试 |
| 现有 Rust 程序真实 Token 资金出口 | `pnpm test:onchain` |
| Web 协议、真实数据库、真实链和页面 | `pnpm test:chain-integration` |

链上集成覆盖两种策略的放款/退款、普通交付付款、签名先保存后由后台广播、失效租约、重复恢复不重复入账、独立初始化后注资、链上提议替换、陈旧版本拒绝、额外 Token 留存、未知里程碑拒绝、捐赠噪声恢复、原签名者限额重试、构建中断，以及 finalized 过期后释放锁并创建新 attempt。原始验证器另验证升级前双边、仲裁及未注资账户的付款和退款。

浏览器覆盖四种争议出口，真实钱包身份挑战和交易签名、刷新与切换钱包；一条用例在 record-signed 已入库但响应中断时关闭页面并重启 Next，再由后台广播和恢复。四种结果均核对数据库 F/R/Q，390px 视口没有横向溢出。

22 次协议操作及 14 次页面交易的公开签名、finalized slot、本金与 Token 余额保存在[协议证据](evidence/iteration-2-chain.json)和[页面证据](evidence/iteration-2-browser.json)。它们来自临时本地验证器，验证器清理后不能通过公共浏览器查询；运行上述命令会生成新一轮证据和页面截图至 `output/iteration-2/`。证据不含私钥、会话或原始签名消息。

本地 `127.0.0.1:5432/vesti` 的 public schema 已应用迁移 `20260930090000_web_chain_disputes`。集成测试使用独立测试 schema，退出后清理；已有迁移保持不变。

## 尚未完成的交付层

Devnet 程序升级、真实钱包扩展验收、远端 CI 结果和正式部署属于后续迭代。本轮没有执行远端部署或推送，默认链上争议开关保持关闭。

历史重放上限为 20,000 个签名；无关版本化交易可跳过，相关但不支持的指令/CPI 封装或旧协议部分结算冲突仍进入 review。review 不提供自动账本修复，应按运维文档核验。发布时还需人工更新程序身份 pin、核对 pending 交易并清理旧头像缓存。
