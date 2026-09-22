"use client";

import { useEffect, useRef, useState } from "react";

const EMPTY_FORM = {
  title: "",
  start_date: "",
  end_date: "",
  priority: "중",
  success_criteria: "",
  estimated_hours: "",
  previous_lesson: "",
};

// pendingLesson: 카드 4 돌아보기에서 "다음 계획에 반영하기"를 눌렀을 때
// 여기로 전달되는 고칠 점 한 줄. onLessonUsed: 그 값을 새 계획에 넣고
// 저장한 뒤 부모(AppShell)에게 "다 썼다"고 알려서 다시 비우게 합니다.
export default function PlanSection({ pendingLesson, onLessonUsed, onPlansChanged }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const formRef = useRef(null);

  // 수정 중인 계획: { [planId]: formValues }
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  // 이력을 펼쳐 본 계획: { [planId]: versions[] }
  const [historyOpen, setHistoryOpen] = useState({});

  async function loadPlans() {
    setLoading(true);
    const res = await fetch("/api/plans");
    const data = await res.json();
    setPlans(data.plans || []);
    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
  }, []);

  // 돌아보기에서 "다음 계획에 반영하기"를 누르면 이 prop이 채워집니다.
  // 새 계획 폼에 자동으로 넣어주고, 눈에 띄게 폼까지 스크롤해줍니다.
  useEffect(() => {
    if (pendingLesson) {
      setNewForm((prev) => ({ ...prev, previous_lesson: pendingLesson }));
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pendingLesson]);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "계획을 저장하지 못했습니다.");
      return;
    }
    const hadLesson = Boolean(newForm.previous_lesson);
    setNewForm(EMPTY_FORM);
    if (hadLesson) onLessonUsed?.();
    await loadPlans();
    onPlansChanged?.();
  }

  function startEdit(plan) {
    setEditingId(plan.id);
    setEditForm({
      title: plan.title,
      start_date: plan.start_date,
      end_date: plan.end_date,
      priority: plan.priority,
      success_criteria: plan.success_criteria,
      estimated_hours: String(plan.estimated_hours),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleUpdate(id) {
    setError("");
    const res = await fetch(`/api/plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "계획을 수정하지 못했습니다.");
      return;
    }
    cancelEdit();
    await loadPlans();
    // 수정 직후에는 "고치기 전 내용"이 바로 눈에 보이도록 이력을 열어서 보여줍니다.
    await toggleHistory(id, true);
  }

  async function toggleHistory(id, forceOpen) {
    const isOpen = historyOpen[id] && historyOpen[id].open;
    if (isOpen && !forceOpen) {
      setHistoryOpen((prev) => ({
        ...prev,
        [id]: { open: false, versions: prev[id].versions },
      }));
      return;
    }
    const res = await fetch(`/api/plans/${id}/history`);
    const data = await res.json();
    setHistoryOpen((prev) => ({
      ...prev,
      [id]: { open: true, versions: data.versions || [] },
    }));
  }

  return (
    <>
      <div className="card" ref={formRef}>
        <h2>새 계획 만들기</h2>
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>계획 이름</label>
            <input
              type="text"
              placeholder="예: 네트워크관리사 2급 합격하기"
              value={newForm.title}
              onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
              required
            />
          </div>
          <div className="row2">
            <div className="field">
              <label>시작일</label>
              <input
                type="date"
                value={newForm.start_date}
                onChange={(e) =>
                  setNewForm({ ...newForm, start_date: e.target.value })
                }
                required
              />
            </div>
            <div className="field">
              <label>종료일 (기간)</label>
              <input
                type="date"
                value={newForm.end_date}
                onChange={(e) =>
                  setNewForm({ ...newForm, end_date: e.target.value })
                }
                required
              />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>우선순위</label>
              <select
                value={newForm.priority}
                onChange={(e) =>
                  setNewForm({ ...newForm, priority: e.target.value })
                }
              >
                <option value="상">상</option>
                <option value="중">중</option>
                <option value="하">하</option>
              </select>
            </div>
            <div className="field">
              <label>예상 시간 (시간 단위)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="예: 120"
                value={newForm.estimated_hours}
                onChange={(e) =>
                  setNewForm({ ...newForm, estimated_hours: e.target.value })
                }
                required
              />
            </div>
          </div>
          <div className="field">
            <label>성공 기준</label>
            <textarea
              rows={2}
              placeholder="예: 필기 합격 + 실기 60점 이상으로 합격"
              value={newForm.success_criteria}
              onChange={(e) =>
                setNewForm({ ...newForm, success_criteria: e.target.value })
              }
              required
            />
          </div>
          <div className="field">
            <label>지난 돌아보기에서 넘어온 고칠 점 (선택, 카드 4에서 채워집니다)</label>
            <textarea
              rows={2}
              placeholder="아래 돌아보기에서 '다음 계획에 반영하기'를 누르면 여기 자동으로 들어와요."
              value={newForm.previous_lesson}
              onChange={(e) =>
                setNewForm({ ...newForm, previous_lesson: e.target.value })
              }
            />
          </div>
          <button type="submit" className="btn-primary">
            계획 저장하기
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      </div>

      <div className="card">
        <h2>내 계획 목록</h2>
        {loading && <div className="empty">불러오는 중...</div>}
        {!loading && plans.length === 0 && (
          <div className="empty">아직 만든 계획이 없습니다. 위에서 하나 만들어보세요.</div>
        )}

        {plans.map((plan) => {
          const isEditing = editingId === plan.id;
          const hist = historyOpen[plan.id];
          return (
            <div className="plan-item" key={plan.id}>
              {!isEditing && (
                <>
                  <div className="plan-title">
                    #{plan.id} {plan.title}
                  </div>
                  <div className="plan-meta">
                    기간: {plan.start_date} ~ {plan.end_date}
                    <br />
                    우선순위: {plan.priority} · 예상 시간: {plan.estimated_hours}시간
                    <br />
                    성공 기준: {plan.success_criteria}
                    <br />
                    마지막 수정: {plan.updated_at} · 이전 버전 {plan.history_count}개
                    {plan.previous_lesson && (
                      <>
                        <br />
                        지난 돌아보기에서 넘어온 고칠 점: {plan.previous_lesson}
                      </>
                    )}
                  </div>
                  <div className="plan-actions">
                    <button className="btn-secondary" onClick={() => startEdit(plan)}>
                      수정하기
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => toggleHistory(plan.id)}
                    >
                      {hist && hist.open ? "이력 닫기" : "이력 보기"}
                    </button>
                  </div>
                </>
              )}

              {isEditing && (
                <div>
                  <div className="field">
                    <label>계획 이름</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm({ ...editForm, title: e.target.value })
                      }
                    />
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label>시작일</label>
                      <input
                        type="date"
                        value={editForm.start_date}
                        onChange={(e) =>
                          setEditForm({ ...editForm, start_date: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>종료일</label>
                      <input
                        type="date"
                        value={editForm.end_date}
                        onChange={(e) =>
                          setEditForm({ ...editForm, end_date: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label>우선순위</label>
                      <select
                        value={editForm.priority}
                        onChange={(e) =>
                          setEditForm({ ...editForm, priority: e.target.value })
                        }
                      >
                        <option value="상">상</option>
                        <option value="중">중</option>
                        <option value="하">하</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>예상 시간 (시간)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={editForm.estimated_hours}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            estimated_hours: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>성공 기준</label>
                    <textarea
                      rows={2}
                      value={editForm.success_criteria}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          success_criteria: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="plan-actions">
                    <button className="btn-primary" onClick={() => handleUpdate(plan.id)}>
                      수정 저장
                    </button>{" "}
                    <button className="btn-secondary" onClick={cancelEdit}>
                      취소
                    </button>
                  </div>
                  {error && <div className="error">{error}</div>}
                </div>
              )}

              {hist && hist.open && (
                <div className="history-box">
                  {hist.versions.length === 0 && (
                    <div>아직 고친 이력이 없습니다 (한 번도 수정 안 함).</div>
                  )}
                  {hist.versions.map((v) => (
                    <div className="history-entry" key={v.id}>
                      <strong>이전 버전 #{v.version_no}</strong> (저장 시각: {v.saved_at})
                      <br />
                      이름: {v.title} · 기간: {v.start_date} ~ {v.end_date}
                      <br />
                      우선순위: {v.priority} · 예상 시간: {v.estimated_hours}시간
                      <br />
                      성공 기준: {v.success_criteria}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
