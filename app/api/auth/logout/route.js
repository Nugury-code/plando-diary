import { cookies } from "next/headers";
import { deleteSession } from "../../../../lib/db";
import { SESSION_COOKIE } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/logout
// 세션 행을 서버에서 지워서, 이 브라우저에 남아있는 쿠키 값으로도
// 더는 어떤 요청도 통과하지 못하게 만듭니다 (쿠키만 지우는 게 아님).
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  deleteSession(token);
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
