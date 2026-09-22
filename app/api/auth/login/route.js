import { cookies } from "next/headers";
import { findUserByEmail, verifyPassword, createSession } from "../../../../lib/db";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/login { email, password }
// 이메일 자체가 없을 때와 비밀번호만 틀렸을 때, 안내 문구를 똑같이
// 돌려줍니다. 다르게 알려주면 "이 이메일은 가입돼 있구나"를 외부에서
// 알아낼 수 있게 되기 때문입니다.
export async function POST(request) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const user = findUserByEmail(email);
  const ok = verifyPassword(user, password);

  if (!user || !ok) {
    return Response.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  const { token, expiresAt } = createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());

  return Response.json({
    user: { id: user.id, email: user.email },
    expires_at: expiresAt,
  });
}
