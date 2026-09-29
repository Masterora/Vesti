import type { EventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { escrowBalance } from "@/lib/domain/amount";
import { ServiceError } from "@/lib/services/errors";
import { buildListContractsWhere, listContractsForWallet } from "./list-contracts-for-wallet";
import type { WorkspaceQueryInput } from "@/lib/validations/workspace-query";
import type { SerializedContractListItem } from "@/types/contract";

type TaskType = "respond_dispute" | "review" | "release" | "select_worker" | "fund" | "submit" | "revise";
type DashboardTask = SerializedContractListItem & { taskType: TaskType; occurredAt: string };

async function listDashboardTasks(walletAddress: string, view: "creator" | "worker", disputeWhere: Prisma.ContractWhereInput): Promise<DashboardTask[]> {
  const groups: Array<{ type: TaskType; where: Prisma.ContractWhereInput }> = view === "creator"
    ? [
        { type: "respond_dispute", where: { AND: [{ creatorWallet: walletAddress }, disputeWhere] } },
        { type: "review", where: { status: "active", creatorWallet: walletAddress, milestones: { some: { status: "submitted" } } } },
        { type: "release", where: { status: "active", creatorWallet: walletAddress, milestones: { some: { status: "approved" } } } },
        { type: "select_worker", where: { status: "claimed", creatorWallet: walletAddress } },
        { type: "fund", where: { status: "draft", creatorWallet: walletAddress } }
      ]
    : [
        { type: "revise", where: { status: "active", workerWallet: walletAddress, milestones: { some: { status: "revision_requested" } } } },
        { type: "submit", where: { status: "active", workerWallet: walletAddress, milestones: { some: { status: "ready" } } } }
      ];
  const batches = await Promise.all(groups.map(async (group) => ({
    type: group.type,
    items: await listContractsForWallet({ walletAddress }, { where: group.where, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] })
  })));
  const candidates = batches.flatMap((batch) => batch.items.map((item) => ({ ...item, taskType: batch.type, occurredAt: item.updatedAt })));
  const eventTypes: Record<TaskType, string> = {
    respond_dispute: "dispute_resolution_proposed",
    review: "milestone_proof_submitted",
    release: "milestone_approved",
    select_worker: "contract_claim_requested",
    fund: "contract_claim_accepted",
    submit: "milestone_ready",
    revise: "milestone_revision_requested"
  };
  if (candidates.length) {
    const events = await db.event.groupBy({
      by: ["contractId", "eventType"],
      where: { contractId: { in: candidates.map((item) => item.id) }, eventType: { in: Object.values(eventTypes) as EventType[] } },
      _max: { createdAt: true }
    });
    for (const candidate of candidates) {
      const event = events.find((entry) => entry.contractId === candidate.id && entry.eventType === eventTypes[candidate.taskType]);
      if (event?._max.createdAt) candidate.occurredAt = event._max.createdAt.toISOString();
    }
  }
  return candidates.sort((left, right) => {
    const leftPriority = groups.findIndex((group) => group.type === left.taskType);
    const rightPriority = groups.findIndex((group) => group.type === right.taskType);
    if (view === "worker") {
      const leftDue = left.currentMilestone?.dueAt ?? "9999";
      const rightDue = right.currentMilestone?.dueAt ?? "9999";
      return leftDue.localeCompare(rightDue) || left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id);
    }
    return leftPriority - rightPriority || left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id);
  }).slice(0, 10);
}

function statusWhere(status: WorkspaceQueryInput["status"]): Prisma.ContractWhereInput {
  if (!status || status === "all") return {};
  if (status === "recruiting") return { status: { in: ["open", "claimed"] } };
  return { status };
}

export async function queryWorkspace(input: WorkspaceQueryInput, walletAddress?: string) {
  if (input.kind !== "marketplace" && !walletAddress) {
    throw new ServiceError("Wallet session is required", 401);
  }
  if (input.kind === "dashboard") {
    return dashboardOverview(walletAddress!, input.view ?? "creator");
  }

  const requestedPage = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const relationWhere: Prisma.ContractWhereInput = input.kind === "marketplace"
    ? { isPublic: true, status: { in: ["open", "claimed"] } }
    : input.relation === "created"
      ? { creatorWallet: walletAddress }
      : input.relation === "working"
        ? { workerWallet: walletAddress }
        : { OR: [{ creatorWallet: walletAddress }, { workerWallet: walletAddress }] };
  const filters: Prisma.ContractWhereInput[] = [relationWhere];
  if (input.kind === "contracts" && input.visibility && input.visibility !== "all") filters.push({ isPublic: input.visibility === "public" });
  if (input.kind === "marketplace" && input.tag) filters.push({ tags: { has: input.tag.toLowerCase() } });
  const baseScope: Prisma.ContractWhereInput = { AND: filters };
  const scope: Prisma.ContractWhereInput = { AND: [baseScope, ...(input.kind === "contracts" ? [statusWhere(input.status)] : [])] };
  const listInput = { walletAddress, query: input.q };
  const where = buildListContractsWhere(listInput, scope);
  const [total, grouped] = await Promise.all([
    db.contract.count({ where }),
    input.kind === "contracts" ? db.contract.groupBy({ by: ["status"], where: buildListContractsWhere(listInput, baseScope), _count: { _all: true } }) : Promise.resolve([])
  ]);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const orderBy: Prisma.ContractOrderByWithRelationInput[] = input.sort === "updated_asc"
    ? [{ updatedAt: "asc" }, { id: "asc" }]
    : input.sort === "amount_desc"
      ? [{ totalAmount: "desc" }, { id: "desc" }]
      : [{ updatedAt: "desc" }, { id: "desc" }];
  const items = await listContractsForWallet(listInput, { where: scope, skip: (page - 1) * pageSize, take: pageSize, orderBy });
  const statusCounts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
  statusCounts.recruiting = (statusCounts.open ?? 0) + (statusCounts.claimed ?? 0);

  return { kind: input.kind, items, total, page, pageSize, statusCounts };
}

async function dashboardOverview(walletAddress: string, view: "creator" | "worker") {
  const relatedWhere: Prisma.ContractWhereInput = view === "creator"
    ? { creatorWallet: walletAddress }
    : { workerWallet: walletAddress };
  const disputeWhere: Prisma.ContractWhereInput = {
    status: "disputed",
    disputes: {
      some: {
        OR: [{ status: "open" }, { status: "proposed", proposedBy: { not: walletAddress } }]
      }
    }
  };
  const actionWhere: Prisma.ContractWhereInput = view === "creator"
    ? { OR: [{ status: { in: ["claimed", "draft"] } }, { status: "active", milestones: { some: { status: { in: ["submitted", "approved"] } } } }, disputeWhere] }
    : { status: "active", workerWallet: walletAddress, milestones: { some: { status: { in: ["ready", "revision_requested"] } } } };
  const taskWhere: Prisma.ContractWhereInput = { AND: [relatedWhere, actionWhere] };
  const balanceWhere: Prisma.ContractWhereInput = { creatorWallet: walletAddress, status: { in: ["active", "disputed"] } };
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  const [totalTasks, relatedCount, activeCount, waitingCount, sums, invalidBalances, tasks, recentContracts, receivedThisMonth, applications, waiting, disputeResponses] = await Promise.all([
    db.contract.count({ where: taskWhere }),
    db.contract.count({ where: relatedWhere }),
    db.contract.count({ where: { AND: [relatedWhere, { status: "active" }] } }),
    view === "worker" ? db.contract.count({ where: { workerWallet: walletAddress, status: "active", milestones: { some: { status: { in: ["submitted", "approved"] } } } } }) : Promise.resolve(0),
    view === "creator"
      ? db.contract.aggregate({ where: balanceWhere, _sum: { fundedAmount: true, releasedAmount: true, refundedAmount: true } })
      : db.contract.aggregate({ where: { workerWallet: walletAddress }, _sum: { fundedAmount: true, releasedAmount: true, refundedAmount: true } }),
    view === "creator"
      ? db.$queryRaw<Array<{ invalid_count: bigint }>>`
          SELECT COUNT(*)::bigint AS invalid_count FROM "Contract"
          WHERE "creatorWallet" = ${walletAddress}
            AND status::text IN ('active', 'disputed')
            AND "fundedAmount" < "releasedAmount" + "refundedAmount"
        `
      : Promise.resolve([]),
    listDashboardTasks(walletAddress, view, disputeWhere),
    listContractsForWallet({ walletAddress }, { where: relatedWhere, take: 8 }),
    view === "worker" ? db.milestone.aggregate({ where: { status: "released", releasedAt: { gte: monthStart, lt: monthEnd }, contract: { workerWallet: walletAddress } }, _sum: { amount: true } }) : Promise.resolve(null),
    view === "worker" ? listContractsForWallet({ walletAddress }, { where: { applications: { some: { applicantWallet: walletAddress } }, status: { in: ["open", "claimed"] }, workerWallet: null }, take: 10 }) : Promise.resolve([]),
    view === "worker" ? listContractsForWallet({ walletAddress }, { where: { workerWallet: walletAddress, status: "active", milestones: { some: { status: { in: ["submitted", "approved"] } } } }, take: 10 }) : Promise.resolve([]),
    view === "worker" ? listContractsForWallet({ walletAddress }, { where: { AND: [{ workerWallet: walletAddress }, disputeWhere] }, take: 10 }) : Promise.resolve([])
  ]);

  const escrow = view === "creator" && invalidBalances[0]?.invalid_count === BigInt(0)
    ? escrowBalance(sums._sum.fundedAmount?.toString() ?? "0", sums._sum.releasedAmount?.toString() ?? "0", sums._sum.refundedAmount?.toString() ?? "0")
    : null;

  return {
    kind: "dashboard" as const,
    view,
    totalTasks,
    relatedCount,
    activeCount,
    waitingCount,
    escrowBalance: escrow,
    releasedAmount: sums._sum.releasedAmount?.toString() ?? "0",
    receivedThisMonth: receivedThisMonth?._sum.amount?.toString() ?? "0",
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
    applications,
    waiting,
    disputeResponses,
    tasks,
    recentContracts
  };
}
