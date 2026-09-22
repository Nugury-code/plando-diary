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
  // 할 일을 만들거나 고치거나 완료로 바꿀 때마다 하나씩 늘려서, 돌아보기
  // 섹션이 최신 숫자로 다시 불러오도록 신호를 보냅니다. (돌아보기도 할 일
  // 목록과 마찬가지로 자기 데이터를 마운트될 때 한 번만 불러오고 있어서,
  // 이 신호가 없으면 방금 완료 처리한 할 일이 숫자에 안 잡혔습니다.)
  const [dataVersion, setDataVersion] = useState(0);
  const bumpData = () => setDataVersion((v) => v + 1);

  return (
    <>
      <div className="notice-banner">
        이 화면은 로그인한 내 계정에만 보입니다. 로그인하지 않고 이 주소를
        열면 자료 대신 로그인 화면이 나옵니다.
      </div>

      <a className="btn-secondary" href="/api/export">
        📤 내 자료 전체 내보내기 (파일 1개)
      </a>

      <PlanSection
        pendingLesson={pendingLesson}
        onLessonUsed={() => setPendingLesson("")}
        onPlansChanged={() => setPlansVersion((v) => v + 1)}
      />

      <TodoSection plansVersion={plansVersion} onDataChanged={bumpData} />

      <ExecutionSection dataVersion={dataVersion} />

      <ReviewSection
        onSendLesson={setPendingLesson}
        plansVersion={plansVersion}
        dataVersion={dataVersion}
      />
    </>
  );
}
