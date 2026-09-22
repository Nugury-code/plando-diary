import { getReview } from "../../../lib/db";
import { getRequestUser, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// GET /api/reviews?planId=&start=&end=
// planId, start(마감일 이상), end(마감일 이하) 모두 선택 항목입니다.
export async function GET(request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId") || undefined;
  const start = searchParams.get("start") || undefined;
  const end = searchParams.get("end") || undefined;

  const review = getReview({ userId: user.id, planId, start, end });
  return Response.json(review);
}
