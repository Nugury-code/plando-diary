import { exportAll } from "../../../lib/db";
import { getRequestUser, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// GET /api/export
// 내 계획·할 일·실행 기록 전체를 JSON 파일 하나로 내려받습니다.
// (화면에서 계산한 숫자가 아니라, 저장된 표 내용을 그대로 담습니다.)
export async function GET(request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const data = exportAll(user.id);
  const filename = `plando-export-${data.exported_at.slice(0, 10)}.json`;

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
