import { listPlans, createPlan } from "../../../lib/db";

// 이 라우트는 요청(request) 값을 안 쓰기 때문에, 그냥 두면 Next.js가
// "결과가 항상 똑같겠구나" 하고 빌드할 때 미리 한 번 실행해 버립니다.
// 그러면 빌드 서버에서 데이터베이스 파일을 여는 시도가 겹쳐서
// "database is locked" 에러가 날 수 있어서, 매 요청마다 새로 실행하도록
// 명시적으로 못 박아 둡니다.
export const dynamic = "force-dynamic";

export async function GET() {
  const plans = listPlans();
  return Response.json({ plans });
}

export async function POST(request) {
  const body = await request.json();

  const required = [
    "title",
    "start_date",
    "end_date",
    "priority",
    "success_criteria",
    "estimated_hours",
  ];
  for (const key of required) {
    if (
      body[key] === undefined ||
      body[key] === null ||
      body[key] === ""
    ) {
      return Response.json(
        { error: `${key} 값이 비어 있습니다.` },
        { status: 400 }
      );
    }
  }

  const plan = createPlan({
    title: String(body.title),
    start_date: String(body.start_date),
    end_date: String(body.end_date),
    priority: String(body.priority),
    success_criteria: String(body.success_criteria),
    estimated_hours: Number(body.estimated_hours),
    // 선택 항목: 카드 4 돌아보기에서 넘어온 "고칠 점" 한 줄.
    previous_lesson: body.previous_lesson ? String(body.previous_lesson) : null,
  });

  return Response.json({ plan }, { status: 201 });
}
