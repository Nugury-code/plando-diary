import { cookies } from "next/headers";
import { deleteUserAccount, deleteSession } from "../../../../lib/db";
import { getRequestUser, unauthorized, SESSION_COOKIE } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/auth/account
// 회원 탈퇴. 이 계정과 이 계정 소유의 계획·할 일·실행 기록을 전부
// 지우고, 로그인 세션도 서버에서 지운 뒤 쿠키를 지웁니다.
// 되돌릴 수 없습니다 (확인은 화면 쪽에서 한 번 더 물어봅니다).
export async function DELETE(request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  deleteUserAccount(user.id);
  deleteSession(token);
  cookieStore.delete(SESSION_COOKIE);

  return Response.json({ ok: true });
}
