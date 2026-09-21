import {
  listTodos,
  createTodo,
  TODO_SORT_OPTIONS,
} from "../../../lib/db";

export const dynamic = "force-dynamic";

// GET /api/todos?planId=&q=&status=&tag=&sort=
// 검색·거르기·정렬을 전부 여기(서버)에서 처리해서 내려줍니다.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId") || undefined;
  const q = searchParams.get("q") || undefined;
  const status = searchParams.get("status") || undefined;
  const tag = searchParams.get("tag") || undefined;
  const sort = searchParams.get("sort") || undefined;

  const { rows, sortKey } = listTodos({ planId, q, status, tag, sort });

  return Response.json({
    todos: rows,
    sort: sortKey,
    sort_label: TODO_SORT_OPTIONS[sortKey],
    sort_options: TODO_SORT_OPTIONS,
  });
}

export async function POST(request) {
  const body = await request.json();

  const required = ["plan_id", "title", "priority", "estimated_hours"];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === "") {
      return Response.json(
        { error: `${key} 값이 비어 있습니다.` },
        { status: 400 }
      );
    }
  }

  const todo = createTodo({
    plan_id: body.plan_id,
    title: String(body.title),
    deadline: body.deadline ? String(body.deadline) : null,
    priority: String(body.priority),
    tags: body.tags ? String(body.tags) : "",
    estimated_hours: Number(body.estimated_hours),
  });

  return Response.json({ todo }, { status: 201 });
}
