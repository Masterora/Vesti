import { z } from "zod";

export const workspaceQuerySchema = z.object({
  kind: z.enum(["dashboard", "contracts", "marketplace"]),
  view: z.enum(["creator", "worker"]).optional(),
  relation: z.enum(["all", "created", "working"]).optional(),
  status: z.enum(["all", "recruiting", "open", "claimed", "draft", "active", "disputed", "completed", "cancelled"]).optional(),
  q: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(24).optional(),
  visibility: z.enum(["all", "public", "private"]).optional(),
  sort: z.enum(["updated_desc", "updated_asc", "amount_desc"]).optional(),
  page: z.number().int().min(1).max(100000).optional(),
  pageSize: z.number().int().min(1).max(50).optional()
});

export type WorkspaceQueryInput = z.infer<typeof workspaceQuerySchema>;
