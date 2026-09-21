import { listExecutionLogs } from "../../../lib/db";

export const dynamic = "force-dynamic";

// GET /api/execution-logs?todoId=&planId=
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const todoId = searchParams.get("todoId") || undefined;
  const planId = searchParams.get("planId") || undefined;
  const logs = listExecutionLogs({ todoId, planId });
  return Response.json({ logs });
}
