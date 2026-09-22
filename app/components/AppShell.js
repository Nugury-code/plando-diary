"use client";

import { useState } from "react";
import PlanSection from "./PlanSection";
import TodoSection from "./TodoSection";
import ExecutionSection from "./ExecutionSection";
import ReviewSection from "./ReviewSection";

// 카드 4 "돌아보기"에서 정한 고칠 점을 카드 1 "새 계획 만들기" 폼으로
// 전달하는 다리 역할만 합니다. (두 섹션이 서로 다른 컴포넌트라서
// 부모인 여기서 값을 잠깐 들고 있다가 넘겨줍니다.)
export default function AppShell() {
  const [pendingLesson, setPendingLesson] = useState("");
  // 계획을 새로 만들 때마다 하나씩 늘려서, 할 일 섹션이 "계획 목록"을
  // 다시 불러오도록 신호를 보냅니다. (두 섹션이 계획 목록을 각자 따로
  // 불러오고 있어서, 이 신호가 없으면 방금 만든 계획이 할 일 쪽에는
  // 페이지를 새로고침하기 전까지 안 보였습니다.)
  const [plansVersion, setPlansVersion] = useState(0);

  return (
    <>
      <div className="notice-banner">
        지금은 로그인이 없어 링크를 아는 사람은 누구나 볼 수 있습니다. 남이
        봐도 괜찮은 내용만 넣으세요.
      </div>

      <a className="btn-secondary" href="/api/export">
        내 자료 전체 내보내기 (파일 1개)
      </a>

      <p className="subtitle">
        카드 1 · 계획 세우기 — 지금 실제로 하고 있는 일을 계획으로 넣고, 고쳐도
        고치기 전 내용이 남는지 확인합니다.
      </p>
      <PlanSection
        pendingLesson={pendingLesson}
        onLessonUsed={() => setPendingLesson("")}
        onPlansChanged={() => setPlansVersion((v) => v + 1)}
      />

      <p className="subtitle">
        카드 2 · 할 일 다루기 — 계획에 딸린 할 일을 만들고, 고치고, 완료로
        바꾸고, 검색·거르기·정렬이 되는지 확인합니다.
      </p>
      <TodoSection plansVersion={plansVersion} />

      <p className="subtitle">
        카드 3 · 실제로 한 일 적기 — 할 일을 완료할 때 시작·끝 시각과 막힌
        이유를 기록으로 남기고, 계획 값은 그대로인지, 연달아 완료를 눌러도
        기록이 한 건만 쌓이는지 확인합니다.
      </p>
      <ExecutionSection />

      <p className="subtitle">
        카드 4 · 돌아보기 — 계획·완료·지연·막힘 수와 예상·실제 시간 차이를
        근거 기록과 함께 보고, 고칠 점 한 줄을 다음 계획으로 넘깁니다.
      </p>
      <ReviewSection onSendLesson={setPendingLesson} />
    </>
  );
}
