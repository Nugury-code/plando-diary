import { listExecutionLogs } from "../../../lib/db";
import { getRequestUser, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// GET /api/execution-logs?todoId=&planId=
export async function GET(request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const todoId = searchParams.get("todoId") || undefined;
  const planId = searchParams.get("planId") || undefined;
  const logs = listExecutionLogs({ userId: user.id, todoId, planId });
  return Response.json({ logs });
}
