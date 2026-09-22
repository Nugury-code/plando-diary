import { updateTodo, revertTodoToInProgress, deleteTodo } from "../../../../lib/db";
import { getRequestUser, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// 내용 수정과, "진행중으로 되돌리기"를 함께 처리합니다.
// "완료로 바꾸기"는 실행 기록이 같이 필요해서 /complete 엔드포인트를 따로 씁니다.
export async function PUT(request, context) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  const body = await request.json();

  if (body.status && !body.title) {
    if (body.status === "완료") {
      return Response.json(
        {
          error:
            "완료로 바꿀 때는 시작/끝 시각이 필요해서 /api/todos/[id]/complete 를 써야 합니다.",
        },
        { status: 400 }
      );
    }
    const todo = revertTodoToInProgress(id, user.id);
    if (!todo) {
      return Response.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
    }
    return Response.json({ todo });
  }

  const required = ["title", "priority", "estimated_hours"];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === "") {
      return Response.json(
        { error: `${key} 값이 비어 있습니다.` },
        { status: 400 }
      );
    }
  }

  const todo = updateTodo(id, user.id, {
    title: String(body.title),
    deadline: body.deadline ? String(body.deadline) : null,
    priority: String(body.priority),
    tags: body.tags ? String(body.tags) : "",
    estimated_hours: Number(body.estimated_hours),
  });

  if (!todo) {
    return Response.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({ todo });
}

export async function DELETE(request, context) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  const ok = deleteTodo(id, user.id);
  if (!ok) {
    return Response.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
