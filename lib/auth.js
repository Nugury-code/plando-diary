// API 라우트 안에서 "지금 로그인한 사람이 누구인지" 확인할 때 씁니다.
//
// 로그인 유지는 세션 쿠키 방식입니다: 로그인에 성공하면 서버가 무작위
// 문자열(토큰)을 만들어 sessions 표에 저장하고, 그 토큰만 httpOnly 쿠키로
// 브라우저에 내려줍니다. 브라우저는 이후 요청마다 이 쿠키를 자동으로
// 실어 보내고, 서버는 매번 그 토큰이 sessions 표에 살아있는지(만료 안
// 됐는지) 확인합니다. 쿠키 값 자체에는 비밀번호나 이메일이 전혀 들어있지
// 않고, 의미 없는 무작위 문자열일 뿐입니다.
import { getSessionUser, SESSION_TTL_MS } from "./db";

export const SESSION_COOKIE = "plando_session";

// request.cookies는 Next.js가 App Router 라우트 핸들러에 주는 NextRequest의
// 기능입니다. 여기서 쿠키를 못 찾거나, 토큰이 만료/로그아웃됐으면 null을
// 돌려줍니다 — 그러면 호출한 라우트가 401로 응답합니다.
export function getRequestUser(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function unauthorized() {
  return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
}
