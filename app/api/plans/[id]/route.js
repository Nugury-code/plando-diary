import { updatePlan } from "../../../../lib/db";
import { getRequestUser, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PUT(request, context) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  const body = await request.json();

  const required = [
    "title",
    "start_date",
    "end_date",
    "priority",
    "success_criteria",
    "estimated_hours",
  ];
  for (const key of required) {
    if (
      body[key] === undefined ||
      body[key] === null ||
      body[key] === ""
    ) {
      return Response.json(
        { error: `${key} 값이 비어 있습니다.` },
        { status: 400 }
      );
    }
  }

  const plan = updatePlan(id, user.id, {
    title: String(body.title),
    start_date: String(body.start_date),
    end_date: String(body.end_date),
    priority: String(body.priority),
    success_criteria: String(body.success_criteria),
    estimated_hours: Number(body.estimated_hours),
  });

  if (!plan) {
    return Response.json({ error: "계획을 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({ plan });
}
