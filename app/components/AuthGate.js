"use client";

import { useEffect, useState } from "react";
import AppShell from "./AppShell";

const EMPTY_FORM = { email: "", password: "", password2: "" };

// 앱 전체를 감싸는 문지기 역할입니다. 로그인이 안 돼 있으면 로그인/회원가입
// 화면만 보여주고, 로그인이 확인되면 그 뒤에 실제 다이어리(AppShell)를
// 보여줍니다. 새로고침해도 서버가 세션 쿠키를 다시 확인해서 로그인 상태를
// 그대로 유지합니다.
export default function AuthGate() {
  // checking: 처음에 /api/auth/me로 로그인 여부를 확인하는 중
  // user: 로그인된 사람 (null이면 로그인 화면을 보여줌)
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 회원 탈퇴는 되돌릴 수 없어서, 버튼 한 번으로 바로 지우지 않고
  // "정말 지울까요?" 확인 화면을 한 번 더 거치게 합니다.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function checkSession() {
    setChecking(true);
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
    } else {
      setUser(null);
    }
    setChecking(false);
  }

  useEffect(() => {
    checkSession();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (mode === "signup" && form.password !== form.password2) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }

    setSubmitting(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "요청을 처리하지 못했습니다.");
        return;
      }
      setUser(data.user);
      setForm(EMPTY_FORM);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  // 회원 탈퇴: 계정과 그 계정의 계획·할 일·실행 기록을 전부 지웁니다.
  // 되돌릴 수 없어서, confirmingDelete 화면에서 한 번 더 확인합니다.
  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await fetch("/api/auth/account", { method: "DELETE" });
      setUser(null);
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  if (checking) {
    return <div className="empty">확인하는 중...</div>;
  }

  if (!user) {
    return (
      <div className="card auth-card">
        <h2>{mode === "login" ? "🔒 로그인" : "🔒 회원가입"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>이메일</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>비밀번호{mode === "signup" ? " (8자 이상)" : ""}</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>
          {mode === "signup" && (
            <div className="field">
              <label>비밀번호 확인</label>
              <input
                type="password"
                value={form.password2}
                onChange={(e) =>
                  setForm({ ...form, password2: e.target.value })
                }
                required
                autoComplete="new-password"
              />
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {mode === "login" ? "로그인" : "회원가입"}
          </button>
          {error && <div className="error">{error}</div>}
        </form>
        <div className="sort-caption">
          {mode === "login" ? (
            <>
              계정이 없으신가요?{" "}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
              >
                회원가입
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{" "}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                로그인
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="account-bar">
        <span>{user.email} 로 로그인함</span>
        <span>
          <button className="btn-secondary" onClick={handleLogout}>
            로그아웃
          </button>
          <button
            className="btn-secondary btn-danger"
            onClick={() => setConfirmingDelete(true)}
          >
            회원 탈퇴
          </button>
        </span>
      </div>

      {confirmingDelete && (
        <div className="card">
          <h2>정말 탈퇴할까요?</h2>
          <p className="sort-caption">
            {user.email} 계정과, 이 계정으로 만든 계획·할 일·실행 기록이
            전부 지워집니다. 되돌릴 수 없습니다. 자료를 남기고 싶다면
            먼저 위의 "내 자료 전체 내보내기"로 받아 두세요.
          </p>
          <button
            className="btn-danger"
            onClick={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? "탈퇴하는 중..." : "네, 계정과 자료를 지웁니다"}
          </button>
          <button
            className="btn-secondary"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
          >
            취소
          </button>
        </div>
      )}

      <AppShell />
    </>
  );
}
