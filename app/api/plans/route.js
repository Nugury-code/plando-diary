import { listPlans, createPlan } from "../../../lib/db";

export async function GET() {
  const plans = listPlans();
  return Response.json({ plans });
}

export async function POST(request) {
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

  const plan = createPlan({
    title: String(body.title),
    start_date: String(body.start_date),
    end_date: String(body.end_date),
    priority: String(body.priority),
    success_criteria: String(body.success_criteria),
    estimated_hours: Number(body.estimated_hours),
  });

  return Response.json({ plan }, { status: 201 });
}
