export const supportedLocales = ["en", "zh"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en";

export const messages = {
  en: {
    header: {
      brand: "Vesti",
      tagline: "USDC milestone escrow",
      dashboard: "Dashboard",
      newContract: "New contract"
    },
    language: {
      english: "English",
      chinese: "Chinese"
    },
    wallet: {
      walletAddress: "Wallet address",
      connectedWallet: "Connected wallet",
      notConnected: "Wallet not connected",
      authenticatedSession: "Authenticated wallet session",
      demoWalletAddress: "Demo wallet address",
      disconnect: "Disconnect",
      connect: "Connect",
      connecting: "Connecting...",
      connectTitle: "Connect and sign in with wallet",
      installTitle: "Install a Solana wallet",
      disconnectTitle: "Disconnect wallet session",
      demoCreator: "Demo creator",
      demoWorker: "Demo worker",
      signed: "signed",
      demo: "demo"
    },
    landing: {
      eyebrow: "USDC milestone escrow",
      title: "Remote work payments with milestone-level control.",
      description:
        "Vesti lets a Creator fund a contract, a Worker submit proof, and both sides track approvals, releases, and audit events in a clean escrow workflow.",
      openDashboard: "Open dashboard",
      createContract: "Create contract",
      flowTitle: "Workflow",
      steps: [
        {
          title: "Create",
          text: "Creator defines the contract, Worker wallet, and milestone split."
        },
        {
          title: "Fund",
          text: "Creator signs a Solana funding transaction so escrow is locked on devnet."
        },
        {
          title: "Release",
          text: "Worker submits proof, Creator approves, and the milestone payout is released."
        }
      ]
    },
    dashboard: {
      eyebrow: "Dashboard",
      title: "Milestone escrow",
      description: "Review contracts linked to the current wallet and continue the escrow flow.",
      refresh: "Refresh",
      newContract: "New contract",
      loading: "Loading contracts...",
      connectTitle: "Connect your wallet",
      connectDescription:
        "Sign in with Phantom to view your contracts and continue the on-chain workflow."
    },
    contractList: {
      emptyTitle: "No contracts yet",
      emptyDescription:
        "Create a contract as Creator, then switch to the Worker wallet to submit proof.",
      creator: "Creator",
      worker: "Worker",
      viewer: "Viewer",
      public: "Public",
      private: "Private",
      noDescription: "No description",
      milestones: "milestones"
    },
    newContractPage: {
      eyebrow: "Create",
      title: "New escrow contract",
      description: "Define the Worker wallet, total USDC amount, and milestone split before funding."
    },
    newContract: {
      sectionContract: "Contract",
      sectionMilestones: "Milestones",
      sectionFunding: "Funding summary",
      titleLabel: "Title",
      titlePlaceholder: "Enter a contract title",
      descriptionLabel: "Description",
      descriptionPlaceholder: "Describe the scope, deliverables, and acceptance criteria",
      creatorWalletLabel: "Creator wallet",
      creatorWalletPlaceholder: "Connect your wallet to autofill this field",
      workerWalletLabel: "Worker wallet",
      workerWalletPlaceholder: "Paste the assigned Worker wallet address",
      publicTitle: "Public read-only detail page",
      publicDescription:
        "Anyone with the link can view the contract, milestones, and timeline.",
      addMilestone: "Add",
      removeMilestone: "Remove milestone",
      milestoneTitleLabel: "Title",
      milestoneTitlePlaceholder: "Milestone title",
      milestoneDescriptionLabel: "Description",
      milestoneDescriptionPlaceholder: "What should be delivered for this milestone?",
      milestoneAmountLabel: "Amount",
      milestoneAmountPlaceholder: "0.00",
      dueDateLabel: "Due date",
      dueDatePlaceholder: "YYYY-MM-DD",
      contractTotalLabel: "Contract total",
      milestoneTotalLabel: "Milestone total",
      mismatchError: "Milestone amounts must equal the contract total.",
      submit: "Create contract",
      submitting: "Creating...",
      connectNotice:
        "Connect and sign in with your wallet before creating an on-chain contract."
    },
    contractDetail: {
      missingIdTitle: "Contract id is required",
      missingIdDescription: "Open a contract from the dashboard or use `/contracts/detail?id=...`.",
      eyebrow: "Contract detail",
      loadingTitle: "Loading contract",
      refresh: "Refresh",
      dashboard: "Dashboard",
      public: "Public",
      private: "Private",
      noDescription: "No description",
      notFunded: "Not funded",
      publicNotice:
        "This contract is public. Non-participants can view the detail page in read-only mode.",
      creator: "Creator",
      worker: "Worker",
      viewer: "Viewer",
      escrow: "Escrow",
      saveVisibility: "Saving...",
      makePublic: "Make public",
      makePrivate: "Make private",
      cancelReason: "Cancel reason",
      cancelReasonPlaceholder: "Optional note for the event timeline.",
      fundContract: "Fund contract",
      funding: "Funding...",
      cancelDraft: "Cancel draft",
      cancelling: "Cancelling...",
      milestones: "Milestones",
      milestoneItem: "Milestone",
      timeline: "Timeline",
      noProof: "No proof submitted yet.",
      proof: "Proof",
      openProof: "Open proof",
      disputeReason: "Dispute reason",
      disputePlaceholder: "Explain why this milestone needs to enter dispute.",
      openDispute: "Open dispute",
      openingDispute: "Opening...",
      proofNote: "Proof note",
      proofNotePlaceholder: "Summarize what was delivered.",
      proofUrl: "Proof URL",
      proofUrlPlaceholder: "https://...",
      submitProof: "Submit proof",
      submittingProof: "Submitting...",
      revisionNote: "Revision note",
      revisionPlaceholder: "Describe what needs to be changed before approval.",
      approveMilestone: "Approve milestone",
      approvingMilestone: "Approving...",
      requestRevision: "Request revision",
      requestingRevision: "Requesting...",
      releasePayment: "Release payment",
      releasingPayment: "Releasing..."
    },
    contractProgress: {
      total: "Total",
      funded: "Funded",
      released: "Released"
    },
    timeline: {
      noEvents: "No events recorded yet.",
      actor: "Actor",
      transaction: "Transaction"
    },
    badges: {
      draft: "Draft",
      active: "Active",
      completed: "Completed",
      cancelled: "Cancelled",
      disputed: "Disputed",
      pending: "Pending",
      ready: "Ready",
      submitted: "Submitted",
      revision_requested: "Revision requested",
      approved: "Approved",
      released: "Released",
      contract_created: "Contract created",
      contract_funded: "Contract funded",
      contract_activated: "Contract activated",
      milestone_ready: "Milestone ready",
      milestone_proof_submitted: "Milestone proof submitted",
      milestone_revision_requested: "Milestone revision requested",
      milestone_approved: "Milestone approved",
      milestone_released: "Milestone released",
      contract_completed: "Contract completed",
      contract_cancelled: "Contract cancelled",
      contract_disputed: "Contract disputed"
    },
    dates: {
      noDueDate: "No due date"
    },
    errors: {
      failedToLoadContract: "Failed to load contract",
      failedToLoadContracts: "Failed to load contracts",
      actionFailed: "Action failed",
      failedToCreateContract: "Failed to create contract",
      preparedTransactionMissing: "Prepared Solana transaction is missing",
      confirmedTransactionMissingContract:
        "Confirmed transaction did not return an updated contract",
      escrowActionFailed: "Escrow action failed",
      walletDisconnectFailed: "Wallet disconnect failed",
      walletConnectionFailed: "Wallet connection failed",
      installSigningWallet: "Install a Solana wallet with message signing support",
      connectBeforeOnchain:
        "Connect and sign in with your wallet before submitting an on-chain transaction",
      installTransactionWallet: "Install a Solana wallet with transaction signing support",
      reconnectSameWallet:
        "Reconnect the same wallet you used to sign in before submitting this transaction",
      transactionExpired: "The transaction expired. Please sign again.",
      signatureCanceled: "You canceled the signature. Contract state did not change.",
      onchainTransactionFailed: "The transaction failed on-chain. Contract state did not change.",
      networkUnavailable: "The Solana network is temporarily unavailable. Please try again.",
      requestFailed: "Request failed",
      invalidRequestBody: "Invalid request body",
      invalidJson: "Request body must be valid JSON",
      databaseUnavailable: "Database is unavailable",
      databaseUnavailableDetails: "Check DATABASE_URL and make sure PostgreSQL is running.",
      internalServerError: "Internal server error"
    }
  },
  zh: {
    header: {
      brand: "Vesti",
      tagline: "稳定币里程碑托管",
      dashboard: "看板",
      newContract: "新建合同"
    },
    language: {
      english: "英文",
      chinese: "中文"
    },
    wallet: {
      walletAddress: "钱包地址",
      connectedWallet: "已连接钱包",
      notConnected: "钱包未连接",
      authenticatedSession: "已验证的钱包会话",
      demoWalletAddress: "演示钱包地址",
      disconnect: "断开连接",
      connect: "连接钱包",
      connecting: "连接中...",
      connectTitle: "连接钱包并完成签名登录",
      installTitle: "请安装支持签名的钱包",
      disconnectTitle: "断开当前钱包会话",
      demoCreator: "演示甲方",
      demoWorker: "演示乙方",
      signed: "已登录",
      demo: "演示"
    },
    landing: {
      eyebrow: "稳定币里程碑托管",
      title: "让远程协作按里程碑收付款。",
      description:
        "Vesti 让甲方为合同注资，让乙方提交交付证明，并把审批、放款和审计事件收拢到一条清晰的托管流程里。",
      openDashboard: "打开看板",
      createContract: "创建合同",
      flowTitle: "流程概览",
      steps: [
        {
          title: "创建合同",
          text: "甲方定义合同内容、乙方钱包地址和里程碑拆分。"
        },
        {
          title: "注资托管",
          text: "甲方签署链上注资交易，把资金锁定到测试网络托管账户。"
        },
        {
          title: "审批放款",
          text: "乙方提交证明，甲方审批后按里程碑释放付款。"
        }
      ]
    },
    dashboard: {
      eyebrow: "看板",
      title: "里程碑托管",
      description: "查看当前钱包关联的合同，并继续后续托管流程。",
      refresh: "刷新",
      newContract: "新建合同",
      loading: "正在加载合同...",
      connectTitle: "先连接钱包",
      connectDescription: "请先完成钱包登录，查看你的合同并继续链上流程。"
    },
    contractList: {
      emptyTitle: "还没有合同",
      emptyDescription: "先以甲方身份创建合同，再切换到乙方钱包提交证明。",
      creator: "甲方",
      worker: "乙方",
      viewer: "访客",
      public: "公开",
      private: "私密",
      noDescription: "暂无描述",
      milestones: "个里程碑"
    },
    newContractPage: {
      eyebrow: "创建合同",
      title: "新建托管合同",
      description: "在注资前先定义乙方钱包、总金额，以及里程碑拆分。"
    },
    newContract: {
      sectionContract: "合同信息",
      sectionMilestones: "里程碑",
      sectionFunding: "资金概览",
      titleLabel: "标题",
      titlePlaceholder: "输入合同标题",
      descriptionLabel: "描述",
      descriptionPlaceholder: "描述范围、交付物和验收标准",
      creatorWalletLabel: "甲方钱包",
      creatorWalletPlaceholder: "连接钱包后会自动填入",
      workerWalletLabel: "乙方钱包",
      workerWalletPlaceholder: "粘贴乙方的钱包地址",
      publicTitle: "公开只读详情页",
      publicDescription: "任何拿到链接的人都可以只读查看合同、里程碑和时间线。",
      addMilestone: "新增",
      removeMilestone: "删除里程碑",
      milestoneTitleLabel: "标题",
      milestoneTitlePlaceholder: "里程碑标题",
      milestoneDescriptionLabel: "描述",
      milestoneDescriptionPlaceholder: "这个里程碑需要交付什么？",
      milestoneAmountLabel: "金额",
      milestoneAmountPlaceholder: "0.00",
      dueDateLabel: "截止日期",
      dueDatePlaceholder: "2026-05-11",
      contractTotalLabel: "合同总额",
      milestoneTotalLabel: "里程碑合计",
      mismatchError: "所有里程碑金额之和必须等于合同总额。",
      submit: "创建合同",
      submitting: "创建中...",
      connectNotice: "请先连接钱包并完成签名登录，再创建链上合同。"
    },
    contractDetail: {
      missingIdTitle: "缺少合同编号",
      missingIdDescription: "请从看板打开合同，或使用 `/contracts/detail?id=...` 访问。",
      eyebrow: "合同详情",
      loadingTitle: "正在加载合同",
      refresh: "刷新",
      dashboard: "返回看板",
      public: "公开",
      private: "私密",
      noDescription: "暂无描述",
      notFunded: "尚未注资",
      publicNotice: "当前合同已公开。非参与方也可以只读查看详情页。",
      creator: "甲方",
      worker: "乙方",
      viewer: "访客",
      escrow: "托管账户",
      saveVisibility: "保存中...",
      makePublic: "设为公开",
      makePrivate: "设为私密",
      cancelReason: "取消原因",
      cancelReasonPlaceholder: "可选，会记录到时间线里。",
      fundContract: "注资合同",
      funding: "注资中...",
      cancelDraft: "取消草稿",
      cancelling: "取消中...",
      milestones: "里程碑",
      milestoneItem: "里程碑",
      timeline: "时间线",
      noProof: "还没有提交证明。",
      proof: "证明",
      openProof: "打开证明链接",
      disputeReason: "争议原因",
      disputePlaceholder: "说明为什么这个里程碑需要进入争议流程。",
      openDispute: "发起争议",
      openingDispute: "发起中...",
      proofNote: "证明说明",
      proofNotePlaceholder: "概述这次交付了什么。",
      proofUrl: "证明地址",
      proofUrlPlaceholder: "https://...",
      submitProof: "提交证明",
      submittingProof: "提交中...",
      revisionNote: "修改说明",
      revisionPlaceholder: "说明在批准前还需要修改什么。",
      approveMilestone: "批准里程碑",
      approvingMilestone: "批准中...",
      requestRevision: "要求修改",
      requestingRevision: "提交中...",
      releasePayment: "释放付款",
      releasingPayment: "放款中..."
    },
    contractProgress: {
      total: "总额",
      funded: "已注资",
      released: "已放款"
    },
    timeline: {
      noEvents: "还没有事件记录。",
      actor: "执行者",
      transaction: "交易"
    },
    badges: {
      draft: "草稿",
      active: "进行中",
      completed: "已完成",
      cancelled: "已取消",
      disputed: "争议中",
      pending: "待开始",
      ready: "可提交",
      submitted: "待审核",
      revision_requested: "要求修改",
      approved: "已批准",
      released: "已放款",
      contract_created: "合同已创建",
      contract_funded: "合同已注资",
      contract_activated: "合同已激活",
      milestone_ready: "里程碑已就绪",
      milestone_proof_submitted: "已提交证明",
      milestone_revision_requested: "已要求修改",
      milestone_approved: "里程碑已批准",
      milestone_released: "里程碑已放款",
      contract_completed: "合同已完成",
      contract_cancelled: "合同已取消",
      contract_disputed: "合同争议中"
    },
    dates: {
      noDueDate: "无截止日期"
    },
    errors: {
      failedToLoadContract: "加载合同失败",
      failedToLoadContracts: "加载合同列表失败",
      actionFailed: "操作失败",
      failedToCreateContract: "创建合同失败",
      preparedTransactionMissing: "缺少预构建的链上交易",
      confirmedTransactionMissingContract: "交易确认后没有返回更新后的合同数据",
      escrowActionFailed: "托管操作失败",
      walletDisconnectFailed: "断开钱包失败",
      walletConnectionFailed: "连接钱包失败",
      installSigningWallet: "请安装支持消息签名的钱包",
      connectBeforeOnchain: "请先连接钱包并完成签名登录，再提交链上交易",
      installTransactionWallet: "请安装支持交易签名的钱包",
      reconnectSameWallet: "请重新连接刚才用于登录的同一个钱包后再提交交易",
      transactionExpired: "这笔交易已经过期，请重新签名。",
      signatureCanceled: "你取消了签名，合同状态没有变化。",
      onchainTransactionFailed: "链上交易执行失败，合同状态没有变化。",
      networkUnavailable: "链上网络暂时不可用，请稍后重试。",
      requestFailed: "请求失败",
      invalidRequestBody: "请求体无效",
      invalidJson: "请求体格式不合法",
      databaseUnavailable: "数据库不可用",
      databaseUnavailableDetails: "请检查数据库连接配置，并确认数据库服务已正常运行。",
      internalServerError: "服务器内部错误"
    }
  }
} as const;

export function getMessages(locale: Locale) {
  return messages[locale];
}

export function getBadgeLabel(locale: Locale, value: string) {
  const badgeLabels = messages[locale].badges as Record<string, string>;

  return badgeLabels[value] ?? value.replaceAll("_", " ");
}
