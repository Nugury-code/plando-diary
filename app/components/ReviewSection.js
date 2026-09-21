"use client";

import { useEffect, useState } from "react";

// onSendLesson: 여기서 정한 "고칠 점" 한 줄을 AppShell을 거쳐
// 위에 있는 "새 계획 만들기" 폼으로 보냅니다.
export default function ReviewSection({ onSendLesson }) {
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);

  // 숫자를 눌렀을 때 아래에 어떤 목록을 펼칠지: null | all | completed | delayed | blocked
  const [detailFilter, setDetailFilter] = useState(null);

  const [lesson, setLesson] = useState("");
  const [sent, setSent] = useState(false);

  async function loadPlans() {
    const res = await fetch("/api/plans");
    const data = await res.json();
    setPlans(data.plans || []);
  }

  async function loadReview() {
    setLoading(true);
    const params = new URLSearchParams();
    if (planId) params.set("planId", planId);
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const res = await fetch(`/api/reviews?${params.toString()}`);
    const data = await res.json();
    setReview(data);
    setDetailFilter(null);
    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, start, end]);

  function toggleDetail(key) {
    setDetailFilter((prev) => (prev === key ? null : key));
  }

  function handleSendLesson() {
    if (!lesson.trim()) return;
    onSendLesson?.(lesson.trim());
    setSent(true);
  }

  const items = review?.items || [];
  const visibleItems = (() => {
    if (detailFilter === "all") return items;
    if (detailFilter === "completed") return items.filter((i) => i.is_completed);
    if (detailFilter === "delayed") return items.filter((i) => i.is_delayed);
    if (detailFilter === "blocked") return items.filter((i) => i.is_blocked);
    return [];
  })();

  return (
    <div className="card">
      <h2>돌아보기</h2>
      <p className="sort-caption">
        숫자를 누르면 그 숫자가 어느 할 일 기록에서 나왔는지 바로 아래에 펼쳐집니다.
        완료율만 보지 말고, 예상 시간과 실제 시간이 얼마나 차이 나는지도 같이 보세요.
      </p>

      <div className="row2">
        <div className="field">
          <label>계획으로 거르기</label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">전체 계획</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.id} {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>기간 (마감일 기준, 선택)</label>
          <div className="row2">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {loading && <div className="empty">불러오는 중...</div>}

      {!loading && review && (
        <>
          <div className="plan-actions">
            <button
              className={detailFilter === "all" ? "btn-primary" : "btn-secondary"}
              onClick={() => toggleDetail("all")}
            >
              계획 수(할 일 수): {review.total_count}
            </button>
            <button
              className={detailFilter === "completed" ? "btn-primary" : "btn-secondary"}
              onClick={() => toggleDetail("completed")}
            >
              완료 수: {review.completed_count}
            </button>
            <button
              className={detailFilter === "delayed" ? "btn-primary" : "btn-secondary"}
              onClick={() => toggleDetail("delayed")}
            >
              지연 수: {review.delayed_count}
            </button>
            <button
              className={detailFilter === "blocked" ? "btn-primary" : "btn-secondary"}
              onClick={() => toggleDetail("blocked")}
            >
              막힘 수: {review.blocked_count}
            </button>
          </div>

          <div className="plan-meta">
            예상 시간 합계: {review.estimated_hours_sum}시간 · 실제 시간 합계:{" "}
            {review.actual_hours_sum}시간 · 차이(실제-예상):{" "}
            {review.diff_hours > 0 ? "+" : ""}
            {review.diff_hours}시간
            <br />
            오늘(서울 기준): {review.today_kst}
          </div>

          {detailFilter && (
            <div className="history-box">
              {visibleItems.length === 0 && (
                <div className="empty">해당하는 할 일이 없습니다.</div>
              )}
              {visibleItems.map((item) => (
                <div className="history-entry" key={item.id}>
                  <strong>
                    #{item.id} {item.title}
                  </strong>{" "}
                  ({item.status})
                  <br />
                  계획: {item.plan_title} · 마감일: {item.deadline || "미정"}
                  <br />
                  예상 시간: {item.estimated_hours}시간 · 실제 시간 합계:{" "}
                  {item.actual_hours_sum}시간
                  {item.is_delayed && " · 지연됨"}
                  {item.is_blocked && " · 막힌 적 있음"}
                  {item.logs.length > 0 && (
                    <>
                      <br />
                      실행 기록:{" "}
                      {item.logs
                        .map(
                          (l) =>
                            `${l.start_time}~${l.end_time}(${l.actual_hours}시간${
                              l.blocked_reason ? `, 막힘: ${l.blocked_reason}` : ""
                            })`
                        )
                        .join(" / ")}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="field" style={{ marginTop: "1rem" }}>
        <label>다음 계획에 남길 고칠 점 한 줄</label>
        <textarea
          rows={2}
          placeholder="예: 예상 시간을 실제보다 너무 짧게 잡았다 -> 다음엔 1.5배로 잡기"
          value={lesson}
          onChange={(e) => {
            setLesson(e.target.value);
            setSent(false);
          }}
        />
      </div>
      <button className="btn-primary" onClick={handleSendLesson} disabled={!lesson.trim()}>
        다음 계획에 반영하기
      </button>
      {sent && (
        <div className="sort-caption">
          위 "새 계획 만들기" 폼으로 보냈어요. 화면을 위로 올려서 나머지 값을 채우고
          저장해보세요.
        </div>
      )}
    </div>
  );
}
