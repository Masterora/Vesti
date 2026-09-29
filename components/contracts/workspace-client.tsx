"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronRight, FileText, Plus, Search, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useRuntimeConfig } from "@/components/layout/runtime-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useWallet } from "@/components/wallet/wallet-provider";
import { postJson } from "@/lib/api/client";
import { escrowBalance } from "@/lib/domain/amount";
import { getWalletAvatarImage, getWalletDisplayName } from "@/lib/profile/display-profiles";
import { cn, formatDate, formatDateTime, formatUsdc, shortenWallet } from "@/lib/utils";
import type { SerializedContract, SerializedContractListItem } from "@/types/contract";

type WorkspaceKind = "dashboard" | "contracts" | "marketplace";
type DashboardView = "creator" | "worker";
type ListResponse = { kind: "contracts" | "marketplace"; items: SerializedContractListItem[]; total: number; page: number; pageSize: number; statusCounts: Record<string, number> };
type DashboardTask = SerializedContractListItem & { taskType: "respond_dispute" | "review" | "release" | "select_worker" | "fund" | "submit" | "revise"; occurredAt: string };
type DashboardResponse = {
  kind: "dashboard";
  view: DashboardView;
  totalTasks: number;
  relatedCount: number;
  activeCount: number;
  waitingCount: number;
  escrowBalance: string | null;
  releasedAmount: string;
  receivedThisMonth: string;
  monthStart: string;
  monthEnd: string;
  tasks: DashboardTask[];
  waiting: SerializedContractListItem[];
  applications: SerializedContractListItem[];
  disputeResponses: SerializedContractListItem[];
  recentContracts: SerializedContractListItem[];
};
type WorkspaceResponse = ListResponse | DashboardResponse;

function taskLabel(type: DashboardTask["taskType"], locale: "en" | "zh") {
  const labels = {
    respond_dispute: ["处理争议", "Respond to dispute"],
    review: ["验收交付", "Review delivery"],
    release: ["发起付款", "Release payment"],
    select_worker: ["选择工作者", "Select worker"],
    fund: ["注资", "Fund contract"],
    submit: ["提交交付", "Submit delivery"],
    revise: ["修改交付", "Revise delivery"]
  } satisfies Record<DashboardTask["taskType"], [string, string]>;
  return labels[type][locale === "zh" ? 0 : 1];
}

const statusValues = new Set(["all", "recruiting", "open", "claimed", "draft", "active", "disputed", "completed", "cancelled"]);
const relationValues = new Set(["all", "created", "working"]);
const visibilityValues = new Set(["all", "public", "private"]);
const sortValues = new Set(["updated_desc", "updated_asc", "amount_desc"]);

function initialPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1;
}

function getEscrowBalance(contract: SerializedContractListItem) {
  return escrowBalance(contract.fundedAmount, contract.releasedAmount, contract.refundedAmount);
}

function relationFor(contract: SerializedContractListItem, walletAddress: string) {
  if (contract.creatorWallet === walletAddress) return "creator";
  if (contract.workerWallet === walletAddress) return "worker";
  if (contract.disputePolicy === "arbitrator" && contract.arbitratorWallet === walletAddress) return "arbitrator";
  if (contract.pendingApplicantWallets.includes(walletAddress)) return "applicant";
  return "viewer";
}

function nextAction(contract: SerializedContractListItem, relation: string, locale: "en" | "zh", walletAddress: string, canSettle: boolean) {
  const zh = locale === "zh";
  if (relation === "arbitrator" && contract.status === "disputed") {
    return canSettle ? (zh ? "裁决争议" : "Decide dispute") : (zh ? "查看争议" : "View dispute");
  }
  if (contract.status === "disputed") {
    if (!canSettle) return zh ? "查看争议" : "View dispute";
    if (contract.activeDispute?.status === "open") return zh ? "提出争议方案" : "Propose resolution";
    if (contract.activeDispute?.status === "proposed") return contract.activeDispute.proposedBy === walletAddress ? (zh ? "等待对方回应" : "Awaiting response") : (zh ? "回应争议方案" : "Respond to proposal");
  }
  if (relation === "creator" && contract.status === "claimed") return zh ? "选择工作者" : "Select worker";
  if (relation === "creator" && contract.status === "draft") return zh ? "注资" : "Fund";
  if (relation === "creator" && contract.currentMilestone?.status === "submitted") return zh ? "验收交付" : "Review delivery";
  if (relation === "creator" && contract.currentMilestone?.status === "approved") return zh ? "释放付款" : "Release payment";
  if (relation === "worker" && ["ready", "revision_requested"].includes(contract.currentMilestone?.status ?? "")) return zh ? "提交交付" : "Submit delivery";
  if (relation === "worker" && contract.currentMilestone?.status === "submitted") return zh ? "等待验收" : "Awaiting review";
  if (relation === "worker" && contract.currentMilestone?.status === "approved") return zh ? "等待付款" : "Awaiting payment";
  if (relation === "applicant") return zh ? "等待选择" : "Awaiting selection";
  if (relation === "viewer" && ["open", "claimed"].includes(contract.status)) return zh ? "申请项目" : "Apply";
  return zh ? "查看合约" : "View contract";
}

function EmptyState({ marketplace = false }: { marketplace?: boolean }) {
  const { locale } = useLocale();
  return (
    <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-border p-8 text-center">
      <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">{locale === "zh" ? (marketplace ? "暂时没有公开项目" : "这里还没有合约") : marketplace ? "No public projects yet" : "No contracts here yet"}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{locale === "zh" ? "调整筛选条件，或创建一个新合约开始协作。" : "Adjust the filters or create a contract to start collaborating."}</p>
    </div>
  );
}

function ContractTable({ contracts, walletAddress, marketplace = false }: { contracts: SerializedContractListItem[]; walletAddress: string; marketplace?: boolean }) {
  const { locale } = useLocale();
  if (!contracts.length) return <EmptyState marketplace={marketplace} />;

  return (
    <div className="overflow-hidden border-y border-border md:rounded-md md:border">
      <div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(150px,.8fr)_minmax(170px,1fr)_140px_120px_32px] gap-4 border-b border-border bg-surface px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
        <span>{locale === "zh" ? "合约" : "Contract"}</span><span>{locale === "zh" ? "合作方" : "Counterparty"}</span><span>{locale === "zh" ? "当前里程碑" : "Current milestone"}</span><span className="text-right">{locale === "zh" ? "托管余额" : "Escrow"}</span><span>{locale === "zh" ? "状态" : "Status"}</span><span />
      </div>
      {contracts.map((contract) => {
        const relation = relationFor(contract, walletAddress);
        const counterpartyWallet = relation === "creator" ? contract.workerWallet : contract.creatorWallet;
        const counterpartyName = counterpartyWallet ? getWalletDisplayName(contract.profiles, counterpartyWallet) : null;
        return (
          <Link
            key={contract.id}
            href={`/contracts/detail?id=${contract.id}`}
            className="group grid gap-3 border-b border-border px-4 py-4 transition last:border-b-0 hover:bg-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus md:grid-cols-[minmax(220px,1.5fr)_minmax(150px,.8fr)_minmax(170px,1fr)_140px_120px_32px] md:items-center md:gap-4"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{contract.title}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{contract.displayId}</p>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              {counterpartyWallet ? <ProfileAvatar walletAddress={counterpartyWallet} displayName={counterpartyName} avatarImage={getWalletAvatarImage(contract.profiles, counterpartyWallet)} className="size-7 rounded-md" /> : null}
              <span className="truncate text-sm text-muted-foreground">{counterpartyName || (counterpartyWallet ? shortenWallet(counterpartyWallet) : locale === "zh" ? "待匹配" : "Unassigned")}</span>
            </div>
            <div className="min-w-0 text-sm">
              <p className="truncate">{contract.currentMilestone ? `M${contract.currentMilestone.index} · ${contract.currentMilestone.title}` : `${contract.milestoneCount} ${locale === "zh" ? "个里程碑" : "milestones"}`}</p>
              {contract.currentMilestone?.dueAt ? <p className="mt-1 text-xs text-muted-foreground">{formatDate(contract.currentMilestone.dueAt, locale)}</p> : null}
            </div>
            <p className="font-mono text-sm tabular-nums md:text-right">{formatUsdc(getEscrowBalance(contract) ?? "invalid", locale)}</p>
            <Badge value={contract.status} className="w-max bg-transparent px-0" />
            <ChevronRight className="hidden size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground md:block" aria-hidden="true" />
          </Link>
        );
      })}
    </div>
  );
}

function DashboardView({ overview, walletAddress, onSelect }: { overview: DashboardResponse; walletAddress: string; onSelect: (id: string, milestoneId?: string) => void }) {
  const { locale } = useLocale();
  const runtime = useRuntimeConfig();
  const view = overview.view;
  const isCreator = view === "creator";
  const tasks = overview.tasks;

  return (
    <>
      <section className="grid border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-border" aria-label={locale === "zh" ? "工作台概览" : "Workspace overview"}>
        {[
          [isCreator ? (locale === "zh" ? "进行中" : "Active") : (locale === "zh" ? "待交付" : "To deliver"), String(isCreator ? overview.activeCount : overview.totalTasks)],
          [isCreator ? (locale === "zh" ? "待我处理" : "Action required") : (locale === "zh" ? "等待反馈" : "Waiting feedback"), String(isCreator ? overview.totalTasks : overview.waitingCount)],
          [isCreator ? (locale === "zh" ? "托管中" : "In escrow") : (locale === "zh" ? "本月已收" : "Received this month"), formatUsdc(isCreator ? overview.escrowBalance ?? "invalid" : overview.receivedThisMonth, locale)]
        ].map(([label, value]) => (
          <div key={label} className="px-1 py-5 sm:px-6 first:pl-0">
            <p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      {!isCreator ? <p className="mt-2 text-xs text-muted-foreground">{locale === "zh" ? "UTC 统计区间" : "UTC reporting period"}: {overview.monthStart.slice(0, 10)} – {overview.monthEnd.slice(0, 10)}</p> : null}

      <section className="mt-8">
        <div className="mb-3 flex items-baseline gap-2"><h2 className="text-lg font-semibold">{locale === "zh" ? (isCreator ? "待我处理" : "待交付") : isCreator ? "Action required" : "To deliver"}</h2><span className="text-sm text-muted-foreground">{overview.totalTasks}</span></div>
        {tasks.length ? (
          <div className="overflow-hidden rounded-md border border-border">
            {tasks.slice(0, 10).map((contract) => (
              <button key={contract.id} type="button" onClick={() => onSelect(contract.id, contract.currentMilestone?.id)} className="grid w-full gap-2 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{contract.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{contract.currentMilestone ? `M${contract.currentMilestone.index} · ${contract.currentMilestone.title}` : contract.displayId} · {contract.currentMilestone?.dueAt ? `${locale === "zh" ? "截止" : "Due"} ${formatDate(contract.currentMilestone.dueAt, locale)}` : formatDateTime(contract.occurredAt, locale)}</p></div>
                <span className="font-mono text-sm">{formatUsdc(contract.currentMilestone?.amount ?? contract.totalAmount, locale)}</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-focus">{contract.taskType === "respond_dispute" && runtime?.canSettleDispute !== true ? (locale === "zh" ? "查看争议" : "View dispute") : taskLabel(contract.taskType, locale)} <ArrowRight className="size-4" /></span>
              </button>
            ))}
          </div>
        ) : <EmptyState />}
      </section>

      {!isCreator ? <>
        <DashboardSection title={locale === "zh" ? "等待反馈" : "Waiting feedback"} contracts={overview.waiting} walletAddress={walletAddress} onSelect={onSelect} />
        <DashboardSection title={locale === "zh" ? "争议待回应" : "Disputes to respond to"} contracts={overview.disputeResponses} walletAddress={walletAddress} onSelect={onSelect} />
        <DashboardSection title={locale === "zh" ? "当前申请" : "Current applications"} contracts={overview.applications} walletAddress={walletAddress} onSelect={onSelect} />
      </> : null}

      <section className="mt-8"><div className="mb-3 flex items-baseline gap-2"><h2 className="text-lg font-semibold">{locale === "zh" ? "我的合约" : "My contracts"}</h2><span className="text-sm text-muted-foreground">{overview.relatedCount}</span></div><ContractTable contracts={overview.recentContracts} walletAddress={walletAddress} /></section>
    </>
  );
}

function DashboardSection({ title, contracts, walletAddress, onSelect }: { title: string; contracts: SerializedContractListItem[]; walletAddress: string; onSelect: (id: string) => void }) {
  const { locale } = useLocale();
  const runtime = useRuntimeConfig();
  if (!contracts.length) return null;
  return <section className="mt-8"><h2 className="mb-3 text-lg font-semibold">{title}</h2><div className="rounded-md border border-border">{contracts.map((contract) => <button key={contract.id} type="button" onClick={() => onSelect(contract.id)} className="flex min-h-14 w-full items-center justify-between gap-4 border-b border-border px-4 text-left last:border-0 hover:bg-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><span className="min-w-0 truncate">{contract.title}</span><span className="shrink-0 text-sm text-focus">{nextAction(contract, relationFor(contract, walletAddress), locale, walletAddress, runtime?.canSettleDispute === true)}</span></button>)}</div></section>;
}

function PreviewPanel({ contractId, milestoneId, walletAddress, onClose, marketplace = false }: { contractId: string; milestoneId?: string | null; walletAddress: string; onClose: () => void; marketplace?: boolean }) {
  const { locale } = useLocale();
  const [response, setResponse] = useState<{ id: string; contract: SerializedContract } | null>(null);
  const [requestError, setRequestError] = useState<{ id: string; message: string } | null>(null);
  const contract = response?.id === contractId ? response.contract : null;
  const error = requestError?.id === contractId ? requestError.message : "";
  const selectedMilestone = contract?.milestones.find((milestone) => milestone.id === milestoneId) ?? contract?.milestones.find((milestone) => milestone.status !== "released") ?? null;
  const latestRevision = contract?.events?.find((event) => event.eventType === "milestone_revision_requested" && event.milestoneId === selectedMilestone?.id);
  const revisionNote = latestRevision?.payload && typeof latestRevision.payload === "object" && !Array.isArray(latestRevision.payload) && "note" in latestRevision.payload && typeof latestRevision.payload.note === "string" ? latestRevision.payload.note : null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    focusReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const media = window.matchMedia("(max-width: 1023px)");
    const previousOverflow = document.body.style.overflow;
    const sync = () => {
      if (media.matches && !dialog?.open) {
        dialog?.showModal();
        document.body.style.overflow = "hidden";
        dialog?.querySelector<HTMLElement>("button")?.focus();
      }
      if (!media.matches && dialog?.open) {
        dialog.close();
        document.body.style.overflow = previousOverflow;
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      mounted.current = false;
      media.removeEventListener("change", sync);
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      focusReturn.current?.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void postJson<SerializedContract>("/api/contracts/get", { contractId, walletAddress: walletAddress || undefined }, { signal: controller.signal })
      .then((value) => setResponse({ id: contractId, contract: value }))
      .catch((cause) => { if (!controller.signal.aborted) setRequestError({ id: contractId, message: (cause as Error).message }); });
    return () => controller.abort();
  }, [contractId, walletAddress]);

  const content = <>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{locale === "zh" ? "项目概览" : "Project overview"}</h2><button type="button" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-focus" aria-label={locale === "zh" ? "关闭预览" : "Close preview"}><X className="size-5" /></button></div>
    {error ? <p className="mt-5 text-sm text-danger">{error}</p> : !contract ? <p className="mt-5 text-sm text-muted-foreground">{locale === "zh" ? "正在加载…" : "Loading…"}</p> : <>
      <h3 className="mt-6 text-xl font-semibold">{contract.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{contract.displayId}</p>
      <div className="mt-4"><Badge value={contract.status} /></div>
      {marketplace && !["open", "claimed"].includes(contract.status) ? <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{locale === "zh" ? "该项目目前不可申请。" : "This project is no longer accepting applications."}</p> : null}
      <p className="mt-5 whitespace-pre-wrap text-sm leading-6">{contract.description || (locale === "zh" ? "暂无项目说明" : "No project description")}</p>
      <p className="mt-5 text-sm font-semibold">{locale === "zh" ? "合约总额" : "Contract total"}: {formatUsdc(contract.totalAmount, locale)}</p>
      <h4 className="mt-6 font-semibold">{locale === "zh" ? "里程碑" : "Milestones"}</h4>
      <ul className="mt-2 space-y-2">{contract.milestones.map((milestone) => <li key={milestone.id} className="rounded-md border border-border p-3 text-sm"><span className="font-medium">M{milestone.index} · {milestone.title}</span><p className="mt-1 text-muted-foreground">{formatUsdc(milestone.amount, locale)} · {formatDate(milestone.dueAt, locale)}</p></li>)}</ul>
      {selectedMilestone && !marketplace ? <section className="mt-6 border-t border-border pt-5"><h4 className="font-semibold">{locale === "zh" ? "当前任务" : "Current task"}</h4><p className="mt-2 text-sm">{selectedMilestone.title}</p><p className="mt-2 text-sm text-muted-foreground">{selectedMilestone.description || (locale === "zh" ? "未提供范围说明" : "No scope description")}</p>{revisionNote ? <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{locale === "zh" ? "最新修改意见：" : "Latest revision request: "}{revisionNote}</p> : null}{selectedMilestone.proofSubmissions?.length ? <div className="mt-4"><h5 className="text-sm font-semibold">{locale === "zh" ? "交付记录" : "Delivery history"}</h5>{selectedMilestone.proofSubmissions.map((proof) => <p key={proof.id} className="mt-2 text-sm text-muted-foreground">v{proof.version} · {proof.note}</p>)}</div> : null}</section> : null}
      <Link href={`/contracts/detail?id=${contract.id}`} className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">{locale === "zh" ? "查看详情与操作" : "Open details and actions"}</Link>
    </>}
  </>;

  return <>
    <aside className="hidden w-[360px] shrink-0 rounded-md border border-border bg-surface p-5 lg:block" aria-label={locale === "zh" ? "项目预览" : "Project preview"}>{content}</aside>
    <dialog ref={dialogRef} onClose={() => { if (mounted.current && window.matchMedia("(max-width: 1023px)").matches) onClose(); }} className="fixed inset-y-0 right-0 ml-auto mr-0 h-dvh max-h-dvh w-[min(420px,100vw)] max-w-full overflow-y-auto border-l border-border bg-surface p-5 text-foreground backdrop:bg-black/60 lg:hidden" aria-label={locale === "zh" ? "项目预览" : "Project preview"}>{content}</dialog>
  </>;
}

export function WorkspaceClient({ kind }: { kind: WorkspaceKind }) {
  const { locale } = useLocale();
  const { walletAddress } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboardView: DashboardView = searchParams.get("view") === "worker" ? "worker" : "creator";
  const [response, setResponse] = useState<{ key: string; data: WorkspaceResponse } | null>(null);
  const [query, setQuery] = useState(() => (searchParams.get("q") ?? "").slice(0, 80));
  const [searchQuery, setSearchQuery] = useState(() => (searchParams.get("q") ?? "").slice(0, 80));
  const [status, setStatus] = useState(() => statusValues.has(searchParams.get("status") ?? "") ? searchParams.get("status")! : "all");
  const [relation, setRelation] = useState(() => relationValues.has(searchParams.get("relation") ?? "") ? searchParams.get("relation")! : "all");
  const [visibility, setVisibility] = useState(() => visibilityValues.has(searchParams.get("visibility") ?? "") ? searchParams.get("visibility")! : "all");
  const [sort, setSort] = useState(() => sortValues.has(searchParams.get("sort") ?? "") ? searchParams.get("sort")! : "updated_desc");
  const [tag, setTag] = useState(() => (searchParams.get("tag") ?? "").slice(0, 24));
  const [page, setPage] = useState(() => initialPage(searchParams.get("page")));
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null);
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const requestKey = JSON.stringify({ kind, walletAddress, view: dashboardView, q: searchQuery, status, relation, visibility, sort, tag, page });
  const data = response?.key === requestKey ? response.data : null;
  const error = requestError?.key === requestKey ? requestError.message : "";
  const requiresWallet = kind !== "marketplace" && !walletAddress;
  const loading = !requiresWallet && (isLoading || (!data && !error));

  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsLoading(true);
    setRequestError(null);
    try {
      const result = await postJson<WorkspaceResponse>("/api/workspace/query", {
        kind,
        view: dashboardView,
        q: searchQuery || undefined,
        status: kind === "contracts" ? status : undefined,
        relation: kind === "contracts" ? relation : undefined,
        visibility: kind === "contracts" ? visibility : undefined,
        tag: kind === "marketplace" ? tag || undefined : undefined,
        sort,
        page: kind === "dashboard" ? undefined : page
      }, { signal: controller.signal });
      if (requestId.current === currentRequestId) {
        if (result.kind !== "dashboard" && result.page !== page) setPage(result.page);
        setResponse({ key: requestKey, data: result });
      }
    } catch (caught) {
      if (requestId.current === currentRequestId && !controller.signal.aborted) {
        setRequestError({ key: requestKey, message: (caught as Error).message });
      }
    } finally {
      if (requestId.current === currentRequestId) {
        activeRequest.current = null;
        setIsLoading(false);
      }
    }
  }, [kind, dashboardView, searchQuery, status, relation, visibility, sort, tag, page, requestKey]);

  useEffect(() => {
    if (requiresWallet) {
      requestId.current += 1;
      activeRequest.current?.abort();
      return;
    }
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timeoutId);
      requestId.current += 1;
      activeRequest.current?.abort();
    };
  }, [load, requiresWallet]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearchQuery(query.trim()), 250);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const urlQuery = (searchParams.get("q") ?? "").slice(0, 80);
      setQuery(urlQuery);
      setSearchQuery(urlQuery.trim());
      setStatus(statusValues.has(searchParams.get("status") ?? "") ? searchParams.get("status")! : "all");
      setRelation(relationValues.has(searchParams.get("relation") ?? "") ? searchParams.get("relation")! : "all");
      setVisibility(visibilityValues.has(searchParams.get("visibility") ?? "") ? searchParams.get("visibility")! : "all");
      setSort(sortValues.has(searchParams.get("sort") ?? "") ? searchParams.get("sort")! : "updated_desc");
      setTag((searchParams.get("tag") ?? "").slice(0, 24));
      setPage(initialPage(searchParams.get("page")));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [searchParams]);

  useEffect(() => {
    if (kind === "dashboard") return;
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (kind === "contracts" && status !== "all") params.set("status", status);
      if (kind === "contracts" && relation !== "all") params.set("relation", relation);
      if (kind === "contracts" && visibility !== "all") params.set("visibility", visibility);
      if (sort !== "updated_desc") params.set("sort", sort);
      if (kind === "marketplace" && tag) params.set("tag", tag);
      const activeProject = new URLSearchParams(window.location.search).get("project");
      if (kind === "marketplace" && activeProject) params.set("project", activeProject);
      if (page > 1) params.set("page", String(page));
      const suffix = params.toString();
      router.replace(`${kind === "contracts" ? "/contracts" : "/marketplace"}${suffix ? `?${suffix}` : ""}`, { scroll: false });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [kind, searchQuery, relation, visibility, sort, tag, router, status, page]);

  const title = kind === "dashboard" ? (locale === "zh" ? "工作台" : "Workspace") : kind === "contracts" ? (locale === "zh" ? "我的合约" : "My contracts") : (locale === "zh" ? "公开项目" : "Marketplace");
  const description = kind === "dashboard" ? (locale === "zh" ? "先处理需要你行动的事项，再安排下一步。" : "Handle what needs you now, then plan what comes next.") : kind === "contracts" ? (locale === "zh" ? "查看你发起和参与的全部合约。" : "Review every contract you created or joined.") : (locale === "zh" ? "寻找公开招募中的项目并申请参与。" : "Discover public projects that are accepting applications.");

  const setView = (view: DashboardView) => router.replace(`/dashboard?view=${view}`);
  const previewKey = kind === "marketplace" ? "project" : "contract";
  const previewId = searchParams.get(previewKey);
  const selectPreview = (id: string, milestoneId?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(previewKey, id);
    if (kind === "dashboard" && milestoneId) params.set("milestone", milestoneId);
    router.push(`${kind === "marketplace" ? "/marketplace" : "/dashboard"}?${params.toString()}`, { scroll: false });
  };
  const closePreview = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(previewKey);
    params.delete("milestone");
    const suffix = params.toString();
    router.replace(`${kind === "marketplace" ? "/marketplace" : "/dashboard"}${suffix ? `?${suffix}` : ""}`, { scroll: false });
  };
  const statuses = [["all", locale === "zh" ? "全部" : "All"], ["recruiting", locale === "zh" ? "招募中" : "Recruiting"], ["draft", locale === "zh" ? "待注资" : "Awaiting funding"], ["active", locale === "zh" ? "进行中" : "Active"], ["disputed", locale === "zh" ? "争议中" : "Disputed"], ["completed", locale === "zh" ? "已完成" : "Completed"], ["cancelled", locale === "zh" ? "已取消" : "Cancelled"]];
  const relations = [["all", locale === "zh" ? "全部角色" : "All roles"], ["created", locale === "zh" ? "我发起的" : "Created by me"], ["working", locale === "zh" ? "我参与的" : "My work"]];

  return (
    <div className="workspace-shell">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-[28px] font-semibold leading-9 tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
        {kind !== "marketplace" ? <Link href="/contracts/new"><Button><Plus className="mr-2 size-4" />{locale === "zh" ? "新建合约" : "New contract"}</Button></Link> : null}
      </header>

      {kind === "dashboard" ? (
        <>
          <div className="mb-6 inline-flex rounded-md border border-border bg-surface p-1" aria-label="Dashboard perspective">
            {(["creator", "worker"] as DashboardView[]).map((view) => <button key={view} type="button" className={cn("min-h-9 rounded px-4 text-sm font-medium text-muted-foreground", dashboardView === view && "bg-selected text-foreground")} onClick={() => setView(view)}>{view === "creator" ? (locale === "zh" ? "我发起的" : "Created by me") : (locale === "zh" ? "我参与的" : "My work")}</button>)}
          </div>
          {requiresWallet ? <ConnectState /> : loading ? <LoadingState /> : error ? <ErrorState message={error} retry={load} /> : data?.kind === "dashboard" ? <div className="flex min-w-0 gap-6"><div className="min-w-0 flex-1"><DashboardView overview={data} walletAddress={walletAddress} onSelect={selectPreview} /></div>{previewId ? <PreviewPanel contractId={previewId} milestoneId={searchParams.get("milestone")} walletAddress={walletAddress} onClose={closePreview} /> : null}</div> : null}
        </>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" maxLength={80} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={locale === "zh" ? "搜索名称、编号或标签" : "Search title, ID, or tag"} aria-label={locale === "zh" ? "搜索合约" : "Search contracts"} /></div>
            {kind === "contracts" ? <div className="flex gap-1 overflow-x-auto pb-1 lg:pb-0">{relations.map(([value, label]) => <button key={value} type="button" className={cn("min-h-11 whitespace-nowrap rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", relation === value && "bg-selected text-foreground")} onClick={() => { setRelation(value); setPage(1); }}>{label}</button>)}</div> : null}
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            {kind === "contracts" ? <label className="text-sm text-muted-foreground">{locale === "zh" ? "可见范围" : "Visibility"}<select className="ml-2 min-h-11 rounded-md border border-border bg-surface px-2 text-foreground" value={visibility} onChange={(event) => { setVisibility(event.target.value); setPage(1); }}><option value="all">{locale === "zh" ? "全部" : "All"}</option><option value="public">{locale === "zh" ? "公开" : "Public"}</option><option value="private">{locale === "zh" ? "私有" : "Private"}</option></select></label> : null}
            {kind === "marketplace" ? <label className="text-sm text-muted-foreground">{locale === "zh" ? "标签" : "Tag"}<Input className="ml-2 inline-block w-40" maxLength={24} value={tag} onChange={(event) => { setTag(event.target.value.trim().toLowerCase()); setPage(1); }} /></label> : null}
            <label className="text-sm text-muted-foreground">{locale === "zh" ? "排序" : "Sort"}<select className="ml-2 min-h-11 rounded-md border border-border bg-surface px-2 text-foreground" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="updated_desc">{locale === "zh" ? "最近更新" : "Recently updated"}</option><option value="updated_asc">{locale === "zh" ? "最早更新" : "Oldest updated"}</option><option value="amount_desc">{locale === "zh" ? "金额从高到低" : "Highest amount"}</option></select></label>
          </div>
          {kind === "contracts" ? <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border pb-2">{statuses.map(([value, label]) => <button key={value} type="button" className={cn("min-h-11 whitespace-nowrap rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", status === value && "bg-selected text-foreground")} onClick={() => { setStatus(value); setPage(1); }}>{label}{data?.kind === "contracts" && value !== "all" ? ` ${data.statusCounts[value] ?? 0}` : ""}</button>)}</div> : null}
          {requiresWallet ? <ConnectState /> : loading ? <LoadingState /> : error ? <ErrorState message={error} retry={load} /> : data && data.kind !== "dashboard" ? (
            <>
              {kind === "marketplace" ? <div className="flex min-w-0 gap-6"><div className="min-w-0 flex-1"><MarketplaceList contracts={data.items} walletAddress={walletAddress} onSelect={selectPreview} /></div>{previewId ? <PreviewPanel contractId={previewId} walletAddress={walletAddress} onClose={closePreview} marketplace /> : null}</div> : <ContractTable contracts={data.items} walletAddress={walletAddress} />}
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function LoadingState() { return <div className="grid gap-3" aria-label="Loading"><div className="h-20 animate-pulse rounded-md bg-surface" /><div className="h-20 animate-pulse rounded-md bg-surface" /><div className="h-20 animate-pulse rounded-md bg-surface" /></div>; }

function ConnectState() {
  const { locale } = useLocale();
  return <div className="rounded-md border border-border bg-surface p-8 text-center"><h2 className="text-lg font-semibold">{locale === "zh" ? "连接钱包后查看工作空间" : "Connect a wallet to view your workspace"}</h2><Link href="/marketplace" className="mt-3 inline-block text-sm text-focus underline">{locale === "zh" ? "浏览公开项目" : "Browse public projects"}</Link></div>;
}

function Pagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const { locale } = useLocale();
  const pageCount = Math.ceil(total / pageSize);
  if (pageCount <= 1) return null;
  return <nav className="mt-5 flex items-center justify-end gap-3" aria-label={locale === "zh" ? "分页" : "Pagination"}>
    <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{locale === "zh" ? "上一页" : "Previous"}</Button>
    <span className="text-sm text-muted-foreground">{page} / {pageCount}</span>
    <Button type="button" variant="secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>{locale === "zh" ? "下一页" : "Next"}</Button>
  </nav>;
}

function ErrorState({ message, retry }: { message: string; retry: () => Promise<void> }) { return <div className="rounded-md border border-danger/30 bg-danger/10 p-5"><p className="text-sm text-danger">{message}</p><Button variant="secondary" className="mt-4" onClick={() => void retry()}>Retry</Button></div>; }

function MarketplaceList({ contracts, walletAddress, onSelect }: { contracts: SerializedContractListItem[]; walletAddress: string; onSelect: (id: string) => void }) {
  const { locale } = useLocale();
  const runtime = useRuntimeConfig();
  if (!contracts.length) return <EmptyState marketplace />;
  return <div className="grid gap-3 xl:grid-cols-2">{contracts.map((contract) => {
    const creatorName = getWalletDisplayName(contract.profiles, contract.creatorWallet);
    return <button key={contract.id} type="button" onClick={() => onSelect(contract.id)} className="group rounded-md border border-border bg-surface p-5 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-semibold">{contract.title}</h2><Badge value={contract.status} /></div><p className="mt-2 line-clamp-2 min-h-11 text-sm leading-[22px] text-muted-foreground">{contract.description || (locale === "zh" ? "暂无项目说明" : "No project description")}</p></div><ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-focus" /></div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-4 text-sm text-muted-foreground"><span className="flex items-center gap-2"><ProfileAvatar walletAddress={contract.creatorWallet} displayName={creatorName} avatarImage={getWalletAvatarImage(contract.profiles, contract.creatorWallet)} className="size-7 rounded-md" />{creatorName || shortenWallet(contract.creatorWallet)}</span><span className="flex items-center gap-1.5"><WalletCards className="size-4" />{formatUsdc(contract.totalAmount, locale)}</span><span className="flex items-center gap-1.5"><CalendarDays className="size-4" />{contract.milestoneCount} {locale === "zh" ? "个里程碑" : "milestones"}</span></div>
      {contract.tags.length ? <div className="mt-4 flex flex-wrap gap-2">{contract.tags.map((tag) => <span key={tag} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">#{tag}</span>)}</div> : null}
      <p className="mt-4 text-sm font-medium text-focus">{nextAction(contract, relationFor(contract, walletAddress), locale, walletAddress, runtime?.canSettleDispute === true)}</p>
    </button>;
  })}</div>;
}
