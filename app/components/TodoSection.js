"use client";

import { useEffect, useState } from "react";

const EMPTY_FORM = {
  plan_id: "",
  title: "",
  deadline: "",
  priority: "중",
  tags: "",
  estimated_hours: "",
};

const EMPTY_FILTERS = {
  planId: "",
  q: "",
  status: "전체",
  tag: "",
  sort: "deadline_asc",
};

export default function TodoSection({ plansVersion, onDataChanged }) {
  const [plans, setPlans] = useState([]);
  const [todos, setTodos] = useState([]);
  const [sortOptions, setSortOptions] = useState({});
  const [sortLabel, setSortLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  // 완료 처리 중인 할 일: 완료로 바꾸려면 시작/끝 시각을 먼저 입력받습니다.
  const [completingId, setCompletingId] = useState(null);
  const [completeForm, setCompleteForm] = useState({
    start_time: "",
    end_time: "",
    blocked_reason: "",
  });
  const [completing, setCompleting] = useState(false);

  async function loadPlans() {
    const res = await fetch("/api/plans");
    const data = await res.json();
    setPlans(data.plans || []);
  }

  async function loadTodos(currentFilters) {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentFilters.planId) params.set("planId", currentFilters.planId);
    if (currentFilters.q) params.set("q", currentFilters.q);
    if (currentFilters.status) params.set("status", currentFilters.status);
    if (currentFilters.tag) params.set("tag", currentFilters.tag);
    if (currentFilters.sort) params.set("sort", currentFilters.sort);

    const res = await fetch(`/api/todos?${params.toString()}`);
    const data = await res.json();
    setTodos(data.todos || []);
    setSortOptions(data.sort_options || {});
    setSortLabel(data.sort_label || "");
    setLoading(false);
  }

  // 계획 목록은 AppShell이 보내는 plansVersion이 바뀔 때마다 다시 불러옵니다.
  // (처음 마운트될 때도 한 번 실행되어 초기 목록을 불러옵니다.)
  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansVersion]);

  useEffect(() => {
    loadTodos(EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateFilter(patch) {
    const next = { ...filters, ...patch };
    setFilters(next);
    loadTodos(next);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "할 일을 저장하지 못했습니다.");
      return;
    }
    setNewForm({ ...EMPTY_FORM, plan_id: newForm.plan_id });
    await loadTodos(filters);
    onDataChanged?.();
  }

  function startEdit(todo) {
    setEditingId(todo.id);
    setEditForm({
      plan_id: String(todo.plan_id),
      title: todo.title,
      deadline: todo.deadline || "",
      priority: todo.priority,
      tags: todo.tags || "",
      estimated_hours: String(todo.estimated_hours ?? ""),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleUpdate(id) {
    setError("");
    const res = await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "할 일을 수정하지 못했습니다.");
      return;
    }
    cancelEdit();
    await loadTodos(filters);
    onDataChanged?.();
  }

  // "완료"는 여기서 바로 안 바꾸고, 시작/끝 시각을 입력하는 폼을 엽니다.
  // "진행중"으로 되돌리는 건 실행 기록이 필요 없어서 바로 처리합니다.
  async function toggleStatus(todo) {
    if (todo.status === "완료") {
      await fetch(`/api/todos/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "진행중" }),
      });
      await loadTodos(filters);
      onDataChanged?.();
      return;
    }
    setCompletingId(todo.id);
    setCompleteForm({ start_time: "", end_time: "", blocked_reason: "" });
    setError("");
  }

  function cancelComplete() {
    setCompletingId(null);
  }

  // 완료 버튼을 연달아 눌러도, 이미 요청이 진행 중이면 다시 보내지 않습니다.
  // (진짜 중복 방지는 서버 쪽 completeTodo에서 하지만, 화면에서도 이중으로 막아둡니다.)
  async function submitComplete(id) {
    if (completing) return;
    if (!completeForm.start_time || !completeForm.end_time) {
      setError("시작 시각과 끝난 시각을 입력해주세요.");
      return;
    }
    setCompleting(true);
    setError("");
    try {
      const res = await fetch(`/api/todos/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "완료 처리에 실패했습니다.");
        return;
      }
      setCompletingId(null);
      await loadTodos(filters);
      onDataChanged?.();
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete(id) {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    await loadTodos(filters);
    onDataChanged?.();
  }

  return (
    <>
      <div className="card">
        <h2>✅ 새 할 일 만들기</h2>
        {plans.length === 0 ? (
          <div className="empty">
            먼저 위에서 계획을 하나 만들어야 할 일을 넣을 수 있어요.
          </div>
        ) : (
          <form onSubmit={handleCreate}>
            <div className="field">
              <label>어떤 계획에 딸린 할 일인가요</label>
              <select
                value={newForm.plan_id}
                onChange={(e) => setNewForm({ ...newForm, plan_id: e.target.value })}
                required
              >
                <option value="" disabled>
                  계획을 선택하세요
                </option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>할 일 내용</label>
              <input
                type="text"
                placeholder="예: 기출문제 1회차 풀기"
                value={newForm.title}
                onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                required
              />
            </div>
            <div className="row2">
              <div className="field">
                <label>마감일</label>
                <input
                  type="date"
                  value={newForm.deadline}
                  onChange={(e) => setNewForm({ ...newForm, deadline: e.target.value })}
                />
              </div>
              <div className="field">
                <label>우선순위</label>
                <select
                  value={newForm.priority}
                  onChange={(e) => setNewForm({ ...newForm, priority: e.target.value })}
                >
                  <option value="상">상</option>
                  <option value="중">중</option>
                  <option value="하">하</option>
                </select>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>태그 (쉼표로 구분)</label>
                <input
                  type="text"
                  placeholder="예: 필기,암기"
                  value={newForm.tags}
                  onChange={(e) => setNewForm({ ...newForm, tags: e.target.value })}
                />
              </div>
              <div className="field">
                <label>예상 시간 (시간)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="예: 3"
                  value={newForm.estimated_hours}
                  onChange={(e) =>
                    setNewForm({ ...newForm, estimated_hours: e.target.value })
                  }
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn-primary">
              할 일 저장하기
            </button>
            {error && <div className="error">{error}</div>}
          </form>
        )}
      </div>

      <div className="card">
        <h2>📌 할 일 목록</h2>

        <div className="row2">
          <div className="field">
            <label>검색 (내용)</label>
            <input
              type="text"
              placeholder="예: 기출"
              value={filters.q}
              onChange={(e) => updateFilter({ q: e.target.value })}
            />
          </div>
          <div className="field">
            <label>계획으로 거르기</label>
            <select
              value={filters.planId}
              onChange={(e) => updateFilter({ planId: e.target.value })}
            >
              <option value="">전체 계획</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>상태로 거르기</label>
            <select
              value={filters.status}
              onChange={(e) => updateFilter({ status: e.target.value })}
            >
              <option value="전체">전체</option>
              <option value="진행중">진행중</option>
              <option value="완료">완료</option>
            </select>
          </div>
          <div className="field">
            <label>태그로 거르기 (일부만 입력해도 됨)</label>
            <input
              type="text"
              placeholder="예: 필기"
              value={filters.tag}
              onChange={(e) => updateFilter({ tag: e.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <label>정렬 기준</label>
          <select
            value={filters.sort}
            onChange={(e) => updateFilter({ sort: e.target.value })}
          >
            {Object.entries(sortOptions).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="sort-caption">지금 정렬 기준: {sortLabel}</div>

        {loading && <div className="empty">불러오는 중...</div>}
        {!loading && todos.length === 0 && (
          <div className="empty">조건에 맞는 할 일이 없습니다.</div>
        )}

        {todos.map((todo) => {
          const isEditing = editingId === todo.id;
          const isCompleting = completingId === todo.id;
          return (
            <div
              className={
                todo.status === "완료" ? "plan-item plan-item-done" : "plan-item"
              }
              key={todo.id}
            >
              {!isEditing && (
                <>
                  <div className="plan-title">
                    {todo.status === "완료" ? "✅ " : ""}#{todo.id} {todo.title}
                  </div>
                  <div className="plan-meta">
                    계획: {todo.plan_title}
                    <br />
                    마감일: {todo.deadline || "미정"} · 우선순위: {todo.priority} ·
                    예상 시간: {todo.estimated_hours}시간
                    <br />
                    태그: {todo.tags || "없음"} · 상태: {todo.status}
                  </div>

                  {!isCompleting && (
                    <div className="plan-actions">
                      <button className="btn-secondary" onClick={() => startEdit(todo)}>
                        수정하기
                      </button>
                      <button className="btn-secondary" onClick={() => toggleStatus(todo)}>
                        {todo.status === "완료" ? "진행중으로 되돌리기" : "완료로 바꾸기"}
                      </button>
                      <button className="btn-secondary" onClick={() => handleDelete(todo.id)}>
                        삭제
                      </button>
                    </div>
                  )}

                  {isCompleting && (
                    <div className="history-box">
                      <div className="field">
                        <label>시작 시각</label>
                        <input
                          type="datetime-local"
                          value={completeForm.start_time}
                          onChange={(e) =>
                            setCompleteForm({ ...completeForm, start_time: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>끝난 시각</label>
                        <input
                          type="datetime-local"
                          value={completeForm.end_time}
                          onChange={(e) =>
                            setCompleteForm({ ...completeForm, end_time: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>막혔던 이유 (없으면 비워두세요)</label>
                        <input
                          type="text"
                          placeholder="예: 중간에 인터넷 끊겨서 20분 날림"
                          value={completeForm.blocked_reason}
                          onChange={(e) =>
                            setCompleteForm({
                              ...completeForm,
                              blocked_reason: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="plan-actions">
                        <button
                          className="btn-primary"
                          disabled={completing}
                          onClick={() => submitComplete(todo.id)}
                        >
                          완료 확정
                        </button>{" "}
                        <button className="btn-secondary" onClick={cancelComplete}>
                          취소
                        </button>
                      </div>
                      {error && <div className="error">{error}</div>}
                    </div>
                  )}
                </>
              )}

              {isEditing && (
                <div>
                  <div className="field">
                    <label>할 일 내용</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    />
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label>마감일</label>
                      <input
                        type="date"
                        value={editForm.deadline}
                        onChange={(e) =>
                          setEditForm({ ...editForm, deadline: e.target.value })
                        }
                      />
                    </div>
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
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label>태그 (쉼표로 구분)</label>
                      <input
                        type="text"
                        value={editForm.tags}
                        onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>예상 시간 (시간)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={editForm.estimated_hours}
                        onChange={(e) =>
                          setEditForm({ ...editForm, estimated_hours: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="plan-actions">
                    <button className="btn-primary" onClick={() => handleUpdate(todo.id)}>
                      수정 저장
                    </button>{" "}
                    <button className="btn-secondary" onClick={cancelEdit}>
                      취소
                    </button>
                  </div>
                  {error && <div className="error">{error}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
