import { getRequestUser, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// GET /api/auth/me
// 로그인 상태 확인용. 로그인 안 돼 있으면(쿠키 없음/만료/로그아웃됨) 401.
export async function GET(request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();
  return Response.json({ user: { id: user.id, email: user.email } });
}
