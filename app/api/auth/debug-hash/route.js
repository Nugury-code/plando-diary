import { getRequestUser, unauthorized } from "../../../../lib/auth";
import { findUserByEmail } from "../../../../lib/db";

export const dynamic = "force-dynamic";

// GET /api/auth/debug-hash
// 임시 확인용 엔드포인트입니다 (카드 2 증거 수집 끝나면 지웁니다).
// 로그인한 "내" 계정의 저장된 비밀번호 해시만 보여줍니다 (남의 것은 못 봄).
export async function GET(request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const full = findUserByEmail(user.email);
  return Response.json({
    email: full.email,
    password_hash: full.password_hash,
  });
}
