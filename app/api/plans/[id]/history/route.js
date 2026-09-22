import { getPlanHistory } from "../../../../../lib/db";
import { getRequestUser, unauthorized } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  const versions = getPlanHistory(id, user.id);
  if (versions === null) {
    return Response.json({ error: "계획을 찾을 수 없습니다." }, { status: 404 });
  }
  return Response.json({ versions });
}
