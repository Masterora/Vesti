import { getMessages, messages, type Locale } from "./messages";

const exactErrorMap: Record<string, keyof typeof messages.en.errors> = {
  "Failed to load contract": "failedToLoadContract",
  "Failed to load contracts": "failedToLoadContracts",
  "Action failed": "actionFailed",
  "Failed to create contract": "failedToCreateContract",
  "Failed to claim project": "failedToClaimContract",
  "Failed to accept worker claim": "failedToAcceptClaim",
  "Failed to post comment": "failedToPostComment",
  "Failed to update profile": "failedToUpdateProfile",
  "Prepared Solana transaction is missing": "preparedTransactionMissing",
  "Confirmed transaction did not return an updated contract": "confirmedTransactionMissingContract",
  "Escrow action failed": "escrowActionFailed",
  "Wallet disconnect failed": "walletDisconnectFailed",
  "Wallet connection failed": "walletConnectionFailed",
  "Install a Solana wallet with message signing support": "installSigningWallet",
  "Connect and sign in with your wallet before submitting an on-chain transaction":
    "connectBeforeOnchain",
  "Install a Solana wallet with transaction signing support": "installTransactionWallet",
  "Reconnect the same wallet you used to sign in before submitting this transaction":
    "reconnectSameWallet",
  "The transaction expired. Please sign again.": "transactionExpired",
  "You canceled the signature. Contract state did not change.": "signatureCanceled",
  "The transaction failed on-chain. Contract state did not change.": "onchainTransactionFailed",
  "The creator wallet does not have enough USDC balance to finish this transaction.":
    "insufficientTokenBalance",
  "The Solana network is temporarily unavailable. Please try again.": "networkUnavailable",
  "Request failed": "requestFailed",
  "Invalid request body": "invalidRequestBody",
  "Request body must be valid JSON": "invalidJson",
  "Database is unavailable": "databaseUnavailable",
  "Check DATABASE_URL and make sure PostgreSQL is running.": "databaseUnavailableDetails",
  "Internal server error": "internalServerError"
};

const exactZhMessages: Record<string, string> = {
  "Wallet session is required": "需要先建立钱包会话。",
  "Contract not found": "未找到合同。",
  "Milestone not found": "未找到里程碑。",
  "Only the Creator or Worker can view this contract": "只有甲方或乙方可以查看这个合同。",
  "Creator and Worker wallets must be different": "甲方和乙方的钱包地址不能相同。",
  "Creator cannot claim their own contract": "甲方不能申请自己的项目。",
  "Only public contracts can be claimed": "只有公开项目才可以申请接单。",
  "Only open contracts can be claimed": "只有待申请状态的项目才可以申请接单。",
  "Only open or claimed contracts can receive additional claims": "只有待申请或审核中的项目可以继续接收申请。",
  "You have already claimed this contract": "你已经申请过这个项目了。",
  "Only the Creator can accept a worker claim": "只有甲方可以选择乙方。",
  "Only claimed contracts can accept a worker": "只有审核中的项目才可以选择乙方。",
  "Only claimed contracts can accept an applicant": "只有审核中的项目才可以选择乙方。",
  "This contract does not have a pending worker claim": "当前项目没有待处理的申请方。",
  "Selected applicant was not found on this contract": "当前项目中没有找到这位申请方。",
  "Assigned Worker wallet is required before funding": "需要先确认乙方后才能注资。",
  "Assigned Worker wallet is required before release": "需要先确认乙方后才能放款。",
  "Milestone amounts must add up to the contract total": "所有里程碑金额之和必须等于合同总额。",
  "Only the Creator can fund this contract": "只有甲方可以为这个合同注资。",
  "Only draft contracts can be funded": "只有草稿状态的合同可以注资。",
  "Only the Creator can cancel this contract": "只有甲方可以取消这个合同。",
  "Only open, claimed, or draft contracts can be cancelled": "只有待申请、审核中或草稿状态的项目可以取消。",
  "Only the Creator can change contract visibility": "只有甲方可以修改合同可见性。",
  "Only the assigned Worker can submit proof": "只有指定的乙方可以提交证明。",
  "Contract must be active before proof submission": "合同必须处于进行中状态后才能提交证明。",
  "Milestone is not ready for proof submission": "当前里程碑还不能提交证明。",
  "Only the Creator can approve milestones": "只有甲方可以确认里程碑。",
  "Contract must be active before approval": "合同必须处于进行中状态后才能确认里程碑。",
  "Only submitted milestones can be approved": "只有待审核的里程碑可以被确认。",
  "Only the Creator can request milestone revisions": "只有甲方可以要求里程碑修改。",
  "Contract must be active before revision requests": "合同必须处于进行中状态后才能要求修改。",
  "Only submitted milestones can be sent back for revision": "只有待审核的里程碑可以被退回修改。",
  "Only the Creator or Worker can open a dispute": "只有甲方或乙方可以发起争议。",
  "Only public viewers or contract participants can comment on this contract":
    "只有公开合同的访客或当前合同参与方可以留言。",
  "Only active contracts can enter dispute": "只有进行中的合同可以进入争议流程。",
  "This milestone cannot enter dispute from its current status": "当前里程碑状态不能发起争议。",
  "Contract must be active before release": "合同必须处于进行中状态后才能放款。",
  "Only approved milestones can be released": "只有已确认的里程碑可以放款。",
  "Only the Creator can release payments": "只有甲方可以释放付款。",
  "Released amount cannot exceed funded amount": "已放款金额不能超过已注资金额。",
  "Only the Creator can prepare funding": "只有甲方可以准备注资交易。",
  "Only the Creator can prepare payment release": "只有甲方可以准备放款交易。",
  "Wallet auth challenge is invalid or expired": "钱包登录挑战无效或已过期。",
  "Wallet signature is invalid": "钱包签名无效。",
  "AUTH_SECRET is required for wallet sessions": "钱包会话缺少密钥配置。",
  "Mock escrow mode does not require a wallet-signed transaction.":
    "模拟托管模式下不需要钱包签名交易。",
  "Mock escrow mode does not confirm wallet-signed transactions.":
    "模拟托管模式下不会确认钱包签名交易。",
  "NEXT_PUBLIC_SOLANA_RPC_URL is required to submit Solana transactions":
    "提交链上交易前必须先配置网络连接地址。",
  "Solana transaction was not found": "未找到这笔链上交易。",
  "Solana transaction failed": "链上交易执行失败，合同状态没有变化。",
  "Solana transaction is not confirmed yet": "这笔链上交易还没有确认。",
  "Escrow account discriminator does not match EscrowState": "托管账户的链上状态格式不匹配。",
  "u64 value cannot be negative": "u64 数值不能为负数。",
  "Wallet address is required": "钱包地址不能为空。",
  "Date must be valid": "日期格式无效。",
  "Email address is already in use": "这个邮箱已经被使用。"
};

const regexZhMessages: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Amount cannot have more than (\d+) decimal places$/, ([, decimals]) => `金额最多只能保留 ${decimals} 位小数。`],
  [/^Amount must be a positive decimal string$/, () => "金额必须是大于零的十进制字符串。"],
  [/^Token decimals must be a non-negative integer$/, () => "代币精度必须是非负整数。"],
  [/^Unsupported ESCROW_ADAPTER_MODE: (.+)$/, ([, mode]) => `不支持当前托管模式：${mode}。`],
  [/^(.+) must be a valid Solana public key in on-chain escrow mode$/, ([, label]) => `${label} 必须是合法的链上公钥。`],
  [/^contractId is required for on-chain escrow mode$/, () => "链上托管模式下必须提供合同编号。"],
  [/^contractId must be (\d+) bytes or less for Solana PDA seeds$/, ([, bytes]) => `合同编号作为链上种子时不能超过 ${bytes} 个字节。`],
  [
    /^Transaction confirmed on-chain, but (.+)\. Local state was not updated\.$/,
    ([, detail]) =>
      `链上交易已经确认，但${translateReconciliationDetail(detail)}，本地状态没有更新。`
  ]
];

function translateReconciliationDetail(detail: string) {
  const detailMap: Record<string, string> = {
    "the transaction could not be loaded": "交易详情无法加载",
    "the transaction is missing loaded address metadata": "交易缺少地址加载元数据",
    "the submitted instruction count does not match the prepared escrow flow":
      "提交的指令数量与预期托管流程不一致",
    "the submitted instruction accounts do not match the prepared escrow flow":
      "提交的指令账户与预期托管流程不一致",
    "the submitted instruction data does not match the prepared escrow flow":
      "提交的指令数据与预期托管流程不一致",
    "the escrow account was not created on-chain": "链上没有创建托管账户",
    "the escrow account owner does not match the deployed program": "托管账户所有者与已部署程序不匹配",
    "the vault token balance does not match the escrow state": "金库代币余额与托管状态不匹配",
    "the escrow account state does not match the expected contract state": "托管账户状态与预期合同状态不一致"
  };

  return detailMap[detail] ?? detail;
}

export function translateErrorMessage(locale: Locale, message: string) {
  const commonKey = exactErrorMap[message];

  if (commonKey) {
    return getMessages(locale).errors[commonKey];
  }

  if (locale === "en") {
    return message;
  }

  if (exactZhMessages[message]) {
    return exactZhMessages[message];
  }

  for (const [pattern, translate] of regexZhMessages) {
    const match = message.match(pattern);

    if (match) {
      return translate(match);
    }
  }

  return message;
}
