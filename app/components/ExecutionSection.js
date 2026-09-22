"use client";

import { useEffect, useState } from "react";

// 실행 기록은 새로 만들지 않고 "보기 전용"으로만 보여줍니다.
// 실행 기록을 만드는 방법은 위 할 일 목록에서 "완료로 바꾸기"를 누르는 것뿐입니다.
export default function ExecutionSection({ dataVersion }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadLogs() {
    setLoading(true);
    const res = await fetch("/api/execution-logs");
    const data = await res.json();
    setLogs(data.logs || []);
    setLoading(false);
  }

  // 다른 할 일을 완료로 바꿀 때(dataVersion)마다 자동으로도 다시 불러오고,
  // "새로고침" 버튼으로 수동으로도 확인할 수 있게 둘 다 남겨둡니다.
  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  return (
    <div className="card">
      <h2>📝 실행 기록</h2>
      <p className="sort-caption">
        할 일을 "완료로 바꾸기" 할 때 입력한 시작/끝 시각이 여기에 쌓입니다.
        새로고침 해도 그대로 남아있는지, 어느 할 일에 붙어 있는지 확인해보세요.
      </p>

      <button className="btn-secondary" onClick={loadLogs}>
        새로고침
      </button>

      {loading && <div className="empty">불러오는 중...</div>}
      {!loading && logs.length === 0 && (
        <div className="empty">
          아직 실행 기록이 없습니다. 할 일 목록에서 "완료로 바꾸기"를 눌러보세요.
        </div>
      )}

      {logs.map((log) => (
        <div className="plan-item" key={log.id}>
          <div className="plan-title">
            #{log.id} {log.todo_title}
          </div>
          <div className="plan-meta">
            계획: {log.plan_title}
            <br />
            시작: {log.start_time} · 끝: {log.end_time} · 실제 걸린 시간:{" "}
            {log.actual_hours}시간
            <br />
            막혔던 이유: {log.blocked_reason || "없음"}
          </div>
        </div>
      ))}
    </div>
  );
}
