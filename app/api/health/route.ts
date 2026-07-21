import { handleRoute } from "@/lib/api/route-helpers";
import { getSystemHealth } from "@/lib/services/system/get-system-health";

export async function POST(request: Request) {
  return handleRoute(request, getSystemHealth);
}
