import {
  listTodos,
  createTodo,
  TODO_SORT_OPTIONS,
} from "../../../lib/db";
import { getRequestUser, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// GET /api/todos?planId=&q=&status=&tag=&sort=
// 검색·거르기·정렬을 전부 여기(서버)에서 처리해서 내려줍니다.
export async function GET(request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId") || undefined;
  const q = searchParams.get("q") || undefined;
  const status = searchParams.get("status") || undefined;
  const tag = searchParams.get("tag") || undefined;
  const sort = searchParams.get("sort") || undefined;

  const { rows, sortKey } = listTodos({
    userId: user.id,
    planId,
    q,
    status,
    tag,
    sort,
  });

  return Response.json({
    todos: rows,
    sort: sortKey,
    sort_label: TODO_SORT_OPTIONS[sortKey],
    sort_options: TODO_SORT_OPTIONS,
  });
}

export async function POST(request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

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

  const todo = createTodo(user.id, {
    plan_id: body.plan_id,
    title: String(body.title),
    deadline: body.deadline ? String(body.deadline) : null,
    priority: String(body.priority),
    tags: body.tags ? String(body.tags) : "",
    estimated_hours: Number(body.estimated_hours),
  });

  if (!todo) {
    return Response.json(
      { error: "계획을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return Response.json({ todo }, { status: 201 });
}
