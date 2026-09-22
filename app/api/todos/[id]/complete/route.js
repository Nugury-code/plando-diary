import { completeTodo } from "../../../../../lib/db";
import { getRequestUser, unauthorized } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// 할 일을 완료로 바꾸면서 실행 기록(시작·끝·막힌 이유)을 함께 저장합니다.
// 이미 완료 상태라면(연달아 두 번 눌러도) 기록을 새로 만들지 않습니다.
export async function POST(request, context) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  const body = await request.json();

  if (!body.start_time || !body.end_time) {
    return Response.json(
      { error: "시작 시각과 끝난 시각을 모두 입력해야 합니다." },
      { status: 400 }
    );
  }

  const startMs = new Date(body.start_time).getTime();
  const endMs = new Date(body.end_time).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return Response.json(
      { error: "끝난 시각은 시작 시각보다 늦어야 합니다." },
      { status: 400 }
    );
  }

  const result = completeTodo(id, user.id, {
    start_time: body.start_time,
    end_time: body.end_time,
    blocked_reason: body.blocked_reason || "",
  });

  if (!result) {
    return Response.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json(result);
}
