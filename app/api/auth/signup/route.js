import { cookies } from "next/headers";
import { createUser, findUserByEmail, createSession } from "../../../../lib/db";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/signup { email, password }
// 같은 이메일로 두 번 가입은 안 됩니다 (email UNIQUE 제약 + 사전 확인).
export async function POST(request) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !email.includes("@")) {
    return Response.json(
      { error: "이메일 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return Response.json(
      { error: "비밀번호는 8자 이상이어야 합니다." },
      { status: 400 }
    );
  }
  if (findUserByEmail(email)) {
    return Response.json(
      { error: "이미 가입된 이메일입니다." },
      { status: 409 }
    );
  }

  const user = createUser(email, password);
  const { token, expiresAt } = createSession(user.id);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());

  return Response.json(
    { user: { id: user.id, email: user.email }, expires_at: expiresAt },
    { status: 201 }
  );
}
