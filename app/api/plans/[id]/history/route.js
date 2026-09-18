import { getPlanHistory } from "../../../../../lib/db";

export async function GET(request, context) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  const versions = getPlanHistory(id);
  return Response.json({ versions });
}
