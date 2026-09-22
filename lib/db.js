// 서버에서만 실행되는 파일입니다 (브라우저에서 직접 불러오지 않음).
//
// SQLite를 쓰는데, npm으로 따로 설치하는 라이브러리(better-sqlite3) 대신
// Node.js 안에 이미 들어있는 node:sqlite를 씁니다. 그래서 컴퓨터마다
// 빌드 도구가 있어야 하는 문제 없이, npm install만 하면 바로 됩니다.

import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "plando.db");

// 세션(로그인 유지) 값은 7일 뒤 만료됩니다. 로그아웃하거나 만료되면
// 그 즉시 이 값으로는 아무 요청도 통과하지 못합니다.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 이미 만들어져 있던 예전 데이터베이스 파일에는 없을 수 있는 칸을
// 지금이라도 추가합니다 (있으면 그냥 넘어갑니다).
function ensureColumn(database, table, column, ddl) {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// 데이터베이스 파일 열기 + 표 만들기를, 파일을 "불러올 때"가 아니라
// "실제로 처음 쓸 때"까지 미룹니다.
//
// 예전에는 이 파일을 import하자마자 바로 데이터베이스를 열고 CREATE TABLE을
// 실행했는데, Next.js가 배포용으로 빌드할 때 여러 프로세스(워커)를 동시에
// 띄워서 라우트 파일들을 읽어 들이는 과정이 있습니다. 그러면 그 여러
// 프로세스가 동시에 같은 SQLite 파일에 CREATE TABLE / ALTER TABLE을
// 시도하게 되고, SQLite는 그런 동시 쓰기를 허용하지 않아서
// "database is locked" 에러로 빌드가 실패했습니다.
// 그래서 실제 함수가 호출될 때(=요청이 들어왔을 때)만 딱 한 번
// 초기화하도록 바꿨습니다. 이러면 빌드 중에는 이 파일을 불러오기만 할 뿐,
// 데이터베이스 파일을 실제로 열지는 않습니다.
let db = null;

function getDb() {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 같은 서버 안에서 연결을 하나만 유지합니다 (Next.js 개발 모드에서
  // 파일이 여러 번 로드돼도 새 연결을 계속 만들지 않도록).
  db = globalThis.__plandoDb;
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL;");
    globalThis.__plandoDb = db;
  }

  // 회원(user) 테이블. 비밀번호는 원문이 아니라 bcrypt로 되돌릴 수 없게
  // 바꾼 값(해시)만 저장합니다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // 로그인 세션 테이블. 쿠키에는 이 token 값만 담고, 누구인지·언제
  // 끊기는지는 여기(서버)에서 확인합니다. 행을 지우면 그 즉시 로그아웃되고,
  // expires_at이 지난 값도 더는 통하지 않습니다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 계획(plan) 테이블: 지금 보이는 "현재" 계획 한 줄.
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      priority TEXT NOT NULL,
      success_criteria TEXT NOT NULL,
      estimated_hours REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 카드 4 "돌아보기"에서 정한 고칠 점 한 줄을 다음 계획에 넣어 둘 자리입니다.
  ensureColumn(db, "plans", "previous_lesson", "previous_lesson TEXT");

  // 과제 7: 계획이 "누구 것"인지. 로그인 붙이기 전에 만들어 둔 계획은
  // 이 값이 비어(NULL) 있다가, 맨 처음 회원가입하는 사람에게 자동으로
  // 옮겨집니다 (migrateOwnerlessPlansToUser).
  ensureColumn(db, "plans", "user_id", "user_id INTEGER");

  // 계획 이력(plan_versions) 테이블: 계획을 고치기 "직전" 값을 여기에
  // 한 줄씩 쌓아 둡니다. plan_id는 그대로 두고 내용만 바뀌기 때문에,
  // 같은 계획의 예전 모습들을 시간 순으로 다시 볼 수 있습니다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      priority TEXT NOT NULL,
      success_criteria TEXT NOT NULL,
      estimated_hours REAL NOT NULL,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    )
  `);

  // 할 일(todo) 테이블: 계획 하나에 여러 개가 딸립니다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      deadline TEXT,
      priority TEXT NOT NULL,
      tags TEXT,
      estimated_hours REAL,
      status TEXT NOT NULL DEFAULT '진행중',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    )
  `);

  // 실행 기록(execution_logs) 테이블: 계획과는 완전히 별개의 표입니다.
  // 여기에 뭘 저장하든 plans/todos 표의 값은 절대 안 바뀝니다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      actual_hours REAL NOT NULL,
      blocked_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (todo_id) REFERENCES todos(id)
    )
  `);

  return db;
}

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------
// 인증 (회원가입 / 로그인 / 세션)
// ---------------------------------------------------------------------

// 비밀번호를 되돌릴 수 없게 바꾸는(해싱) 부분은 널리 쓰이는 라이브러리인
// bcryptjs에 맡깁니다. 순수 자바스크립트라서(=native 빌드 도구 필요 없음)
// 배포 서버에서 컴파일 실패할 걱정이 없어 골랐습니다.
const BCRYPT_ROUNDS = 10;

export function countUsers() {
  return Number(getDb().prepare(`SELECT COUNT(*) AS c FROM users`).get().c);
}

export function findUserByEmail(email) {
  return getDb()
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(String(email).trim().toLowerCase());
}

export function getUserById(id) {
  return getDb().prepare(`SELECT id, email, created_at FROM users WHERE id = ?`).get(id);
}

// 새 회원을 만듭니다. 맨 처음 만들어지는 회원이면(=지금까지 아무도 없었으면)
// 과제 6에서 로그인 없이 넣어 뒀던 진짜 자료(주인이 없는 계획들)를
// 전부 이 사람 것으로 옮깁니다. ("6번에 넣어 둔 내 자료를 내 계정으로 옮깁니다")
export function createUser(email, password) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const wasFirstUser = countUsers() === 0;
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const ts = nowIso();

  const info = getDb()
    .prepare(
      `INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)`
    )
    .run(normalizedEmail, passwordHash, ts);
  const userId = Number(info.lastInsertRowid);

  if (wasFirstUser) {
    migrateOwnerlessPlansToUser(userId);
  }

  return getUserById(userId);
}

// 로그인 전 없던 자료(plans.user_id가 비어 있던 것)를 한 계정으로 옮깁니다.
// 맨 처음 회원가입할 때 딱 한 번만 실행됩니다.
export function migrateOwnerlessPlansToUser(userId) {
  getDb()
    .prepare(`UPDATE plans SET user_id = ? WHERE user_id IS NULL`)
    .run(userId);
}

export function verifyPassword(user, password) {
  if (!user) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  getDb()
    .prepare(
      `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
    )
    .run(token, userId, createdAt, expiresAt);
  return { token, expiresAt };
}

// 토큰으로 로그인한 사람을 찾습니다. 없거나 만료됐으면 null을 돌려주고,
// 만료된 세션 행은 이 김에 지워 둡니다.
export function getSessionUser(token) {
  if (!token) return null;
  const session = getDb()
    .prepare(`SELECT * FROM sessions WHERE token = ?`)
    .get(token);
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return null;
  }

  return getUserById(session.user_id);
}

export function deleteSession(token) {
  if (!token) return;
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

// ---------------------------------------------------------------------
// 계획 (plan) — 이제부터 모든 조회·수정은 로그인한 사람(userId) 것만.
// ---------------------------------------------------------------------

// 우선순위 글자를 숫자로 바꿔서 "상 > 중 > 하" 순서로 비교할 수 있게 합니다.
const PRIORITY_RANK = { 상: 3, 중: 2, 하: 1 };

export function listPlans(userId) {
  const plans = getDb()
    .prepare(`SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId);
  const countStmt = getDb().prepare(
    `SELECT COUNT(*) AS c FROM plan_versions WHERE plan_id = ?`
  );
  return plans.map((p) => ({
    ...p,
    history_count: Number(countStmt.get(p.id).c),
  }));
}

// 이 id의 계획이 정말 이 사람 것인지 확인합니다. 남의 계획 id를 넣으면
// (또는 없는 id면) null이 돌아옵니다 — 그러면 라우트에서 404로 응답합니다.
export function getPlanOwned(id, userId) {
  return getDb()
    .prepare(`SELECT * FROM plans WHERE id = ? AND user_id = ?`)
    .get(id, userId);
}

export function createPlan(userId, data) {
  const ts = nowIso();
  const stmt = getDb().prepare(`
    INSERT INTO plans
      (user_id, title, start_date, end_date, priority, success_criteria, estimated_hours, previous_lesson, created_at, updated_at)
    VALUES (@user_id, @title, @start_date, @end_date, @priority, @success_criteria, @estimated_hours, @previous_lesson, @created_at, @updated_at)
  `);
  const info = stmt.run({
    user_id: userId,
    title: data.title,
    start_date: data.start_date,
    end_date: data.end_date,
    priority: data.priority,
    success_criteria: data.success_criteria,
    estimated_hours: data.estimated_hours,
    previous_lesson: data.previous_lesson || null,
    created_at: ts,
    updated_at: ts,
  });
  const newId = Number(info.lastInsertRowid);
  return getPlanOwned(newId, userId);
}

// 계획을 수정할 때: 지금 값을 이력 표에 먼저 저장한 다음에만
// plans 테이블 값을 바꿉니다. 그래서 "고치기 전" 내용이 사라지지 않습니다.
export function updatePlan(id, userId, data) {
  const current = getPlanOwned(id, userId);
  if (!current) return null;

  const nextVersionNo =
    (getDb()
      .prepare(
        `SELECT COALESCE(MAX(version_no), 0) AS m FROM plan_versions WHERE plan_id = ?`
      )
      .get(id).m || 0) + 1;

  getDb().exec("BEGIN");
  try {
    getDb().prepare(`
      INSERT INTO plan_versions
        (plan_id, version_no, title, start_date, end_date, priority, success_criteria, estimated_hours, saved_at)
      VALUES (@plan_id, @version_no, @title, @start_date, @end_date, @priority, @success_criteria, @estimated_hours, @saved_at)
    `).run({
      plan_id: id,
      version_no: nextVersionNo,
      title: current.title,
      start_date: current.start_date,
      end_date: current.end_date,
      priority: current.priority,
      success_criteria: current.success_criteria,
      estimated_hours: current.estimated_hours,
      saved_at: nowIso(),
    });

    getDb().prepare(`
      UPDATE plans SET
        title = @title,
        start_date = @start_date,
        end_date = @end_date,
        priority = @priority,
        success_criteria = @success_criteria,
        estimated_hours = @estimated_hours,
        updated_at = @updated_at
      WHERE id = @id
    `).run({
      id,
      title: data.title,
      start_date: data.start_date,
      end_date: data.end_date,
      priority: data.priority,
      success_criteria: data.success_criteria,
      estimated_hours: data.estimated_hours,
      updated_at: nowIso(),
    });
    getDb().exec("COMMIT");
  } catch (err) {
    getDb().exec("ROLLBACK");
    throw err;
  }

  return getPlanOwned(id, userId);
}

export function getPlanHistory(id, userId) {
  const owned = getPlanOwned(id, userId);
  if (!owned) return null;
  return getDb()
    .prepare(
      `SELECT * FROM plan_versions WHERE plan_id = ? ORDER BY version_no DESC`
    )
    .all(id);
}

// 정렬 기준 목록. 화면에서 이 중 하나를 골라서 보여줍니다.
// 값이 같을 때는 항상 마지막에 id 오름차순을 붙여서, 볼 때마다
// 순서가 바뀌지 않도록(같은 결과가 나오도록) 만듭니다.
export const TODO_SORT_OPTIONS = {
  deadline_asc: "마감일이 빠른 순 (같으면 먼저 만든 순)",
  deadline_desc: "마감일이 늦은 순 (같으면 먼저 만든 순)",
  priority_desc: "우선순위 높은 순 (같으면 먼저 만든 순)",
  priority_asc: "우선순위 낮은 순 (같으면 먼저 만든 순)",
  created_desc: "최근에 만든 순",
  created_asc: "오래 전에 만든 순",
};

function compareTodos(a, b, sort) {
  switch (sort) {
    case "deadline_desc":
      return (
        (b.deadline || "").localeCompare(a.deadline || "") || a.id - b.id
      );
    case "priority_desc":
      return (
        (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0) ||
        a.id - b.id
      );
    case "priority_asc":
      return (
        (PRIORITY_RANK[a.priority] || 0) - (PRIORITY_RANK[b.priority] || 0) ||
        a.id - b.id
      );
    case "created_desc":
      return b.created_at.localeCompare(a.created_at) || a.id - b.id;
    case "created_asc":
      return a.created_at.localeCompare(b.created_at) || a.id - b.id;
    case "deadline_asc":
    default:
      // 마감일이 없는 할 일은 맨 뒤로 보냅니다.
      return (
        (a.deadline || "9999-99-99").localeCompare(
          b.deadline || "9999-99-99"
        ) || a.id - b.id
      );
  }
}

// 검색·거르기·정렬을 전부 서버(이 함수) 안에서 처리합니다.
// planId, q(검색어), status(전체/진행중/완료), tag, sort를 받습니다.
// p.user_id = @userId 조건이 있어서, 남의 계획 id를 넣어도 결과가 그냥
// 비어 있게 됩니다 (남의 자료가 섞여 나오지 않음).
export function listTodos({ userId, planId, q, status, tag, sort } = {}) {
  let rows = getDb()
    .prepare(
      `SELECT t.*, p.title AS plan_title
       FROM todos t
       JOIN plans p ON p.id = t.plan_id
       WHERE p.user_id = ?`
    )
    .all(userId);

  if (planId) {
    rows = rows.filter((r) => r.plan_id === Number(planId));
  }
  if (status && status !== "전체") {
    rows = rows.filter((r) => r.status === status);
  }
  if (tag) {
    // 태그 하나를 정확히 다 안 쳐도, 일부 글자만 포함되면 찾아지게 합니다.
    const needle = tag.trim().toLowerCase();
    rows = rows.filter((r) =>
      (r.tags || "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .some((t) => t.includes(needle))
    );
  }
  if (q) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(needle));
  }

  const sortKey = TODO_SORT_OPTIONS[sort] ? sort : "deadline_asc";
  rows.sort((a, b) => compareTodos(a, b, sortKey));

  return { rows, sortKey };
}

// 이 id의 할 일이 정말 이 사람 것인지(=딸린 계획의 주인인지) 확인합니다.
export function getTodo(id, userId) {
  return getDb()
    .prepare(
      `SELECT t.* FROM todos t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.id = ? AND p.user_id = ?`
    )
    .get(id, userId);
}

export function createTodo(userId, data) {
  // 어떤 계획에 넣으려는 건지부터, 그 계획이 내 것인지 확인합니다.
  // 남의 계획 id를 적어 보내도 여기서 막힙니다.
  const plan = getPlanOwned(Number(data.plan_id), userId);
  if (!plan) return null;

  const ts = nowIso();
  const stmt = getDb().prepare(`
    INSERT INTO todos
      (plan_id, title, deadline, priority, tags, estimated_hours, status, created_at, updated_at)
    VALUES (@plan_id, @title, @deadline, @priority, @tags, @estimated_hours, '진행중', @created_at, @updated_at)
  `);
  const info = stmt.run({
    plan_id: plan.id,
    title: data.title,
    deadline: data.deadline || null,
    priority: data.priority,
    tags: data.tags || "",
    estimated_hours: data.estimated_hours,
    created_at: ts,
    updated_at: ts,
  });
  return getTodo(Number(info.lastInsertRowid), userId);
}

// 내용 수정 (제목·마감일·우선순위·태그·예상 시간). 상태(완료 여부)는
// setTodoStatus에서 따로 다룹니다.
export function updateTodo(id, userId, data) {
  const current = getTodo(id, userId);
  if (!current) return null;

  getDb().prepare(`
    UPDATE todos SET
      title = @title,
      deadline = @deadline,
      priority = @priority,
      tags = @tags,
      estimated_hours = @estimated_hours,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    title: data.title,
    deadline: data.deadline || null,
    priority: data.priority,
    tags: data.tags || "",
    estimated_hours: data.estimated_hours,
    updated_at: nowIso(),
  });

  return getTodo(id, userId);
}

// 다시 진행 중으로 되돌리기 (완료 → 진행중). 완료로 바꾸는 것은
// 실행 기록을 같이 남겨야 하므로 아래 completeTodo를 따로 씁니다.
export function revertTodoToInProgress(id, userId) {
  const current = getTodo(id, userId);
  if (!current) return null;
  getDb()
    .prepare(
      `UPDATE todos SET status = '진행중', updated_at = @updated_at WHERE id = @id`
    )
    .run({ id, updated_at: nowIso() });
  return getTodo(id, userId);
}

export function deleteTodo(id, userId) {
  const current = getTodo(id, userId);
  if (!current) return false;
  getDb().prepare(`DELETE FROM todos WHERE id = ?`).run(id);
  return true;
}

// 할 일을 "완료"로 바꾸면서, 그 순간의 실행 기록(시작·끝·걸린 시간·막힌 이유)을
// 함께 저장합니다. 이미 완료 상태인 할 일에 또 완료를 시도하면
// (버튼을 연달아 두 번 눌러도) 아무 것도 새로 만들지 않고 그대로 돌려줍니다.
// "UPDATE ... WHERE status != '완료'"가 중복을 막는 실질적인 제약입니다.
export function completeTodo(id, userId, { start_time, end_time, blocked_reason }) {
  const current = getTodo(id, userId);
  if (!current) return null;

  let createdLog = null;
  getDb().exec("BEGIN");
  try {
    const info = getDb()
      .prepare(
        `UPDATE todos SET status = '완료', updated_at = @updated_at
         WHERE id = @id AND status != '완료'`
      )
      .run({ id, updated_at: nowIso() });

    if (info.changes > 0) {
      // 실제로 이번에 "새로" 완료된 경우에만 실행 기록을 한 건 남깁니다.
      const startMs = new Date(start_time).getTime();
      const endMs = new Date(end_time).getTime();
      const actualHours =
        Math.round(((endMs - startMs) / 1000 / 60 / 60) * 100) / 100;

      const logInfo = getDb()
        .prepare(
          `INSERT INTO execution_logs
            (todo_id, start_time, end_time, actual_hours, blocked_reason, created_at)
           VALUES (@todo_id, @start_time, @end_time, @actual_hours, @blocked_reason, @created_at)`
        )
        .run({
          todo_id: id,
          start_time,
          end_time,
          actual_hours: actualHours,
          blocked_reason: blocked_reason || "",
          created_at: nowIso(),
        });

      createdLog = getDb()
        .prepare(`SELECT * FROM execution_logs WHERE id = ?`)
        .get(Number(logInfo.lastInsertRowid));
    }
    getDb().exec("COMMIT");
  } catch (err) {
    getDb().exec("ROLLBACK");
    throw err;
  }

  return {
    todo: getTodo(id, userId),
    log: createdLog,
    created: Boolean(createdLog), // false면 이미 완료 상태였다는 뜻 (중복 방지됨)
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// "오늘"을 서버가 어느 나라에서 돌든 상관없이 항상 서울 기준으로 계산합니다.
// (예: 배포 서버가 미국 시간대여도 지연 여부는 한국 날짜로 판단해야 하므로)
function getTodayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );
}

// 카드 4 "돌아보기": 계획(선택)과 기간(선택, 마감일 기준)에 걸리는 할 일을
// 모아서 계획 수·완료 수·지연 수·막힘 수·예상 시간·실제 시간을 계산합니다.
// 여기서 만드는 숫자는 저장해 두지 않고 매번 todos/execution_logs에서
// 새로 계산합니다 — 그래야 숫자가 항상 지금 기록과 정확히 같습니다.
export function getReview({ userId, planId, start, end } = {}) {
  let todos = getDb()
    .prepare(
      `SELECT t.*, p.title AS plan_title
       FROM todos t
       JOIN plans p ON p.id = t.plan_id
       WHERE p.user_id = ?`
    )
    .all(userId);

  if (planId) {
    todos = todos.filter((t) => t.plan_id === Number(planId));
  }
  if (start) {
    todos = todos.filter((t) => t.deadline && t.deadline >= start);
  }
  if (end) {
    todos = todos.filter((t) => t.deadline && t.deadline <= end);
  }

  const todayKst = getTodayKst();
  const logsStmt = getDb().prepare(
    `SELECT * FROM execution_logs WHERE todo_id = ? ORDER BY start_time ASC, id ASC`
  );

  const items = todos.map((t) => {
    const logs = logsStmt.all(t.id);
    const actualHoursSum = round2(
      logs.reduce((sum, l) => sum + (l.actual_hours || 0), 0)
    );
    const isCompleted = t.status === "완료";
    // 완료한 할 일은 마감일이 지났어도 지연으로 세지 않습니다.
    const isDelayed = !isCompleted && !!t.deadline && t.deadline < todayKst;
    const isBlocked = logs.some((l) => (l.blocked_reason || "").trim() !== "");
    return {
      ...t,
      logs,
      actual_hours_sum: actualHoursSum,
      is_completed: isCompleted,
      is_delayed: isDelayed,
      is_blocked: isBlocked,
    };
  });

  const estimatedSum = round2(
    items.reduce((sum, i) => sum + (i.estimated_hours || 0), 0)
  );
  const actualSum = round2(
    items.reduce((sum, i) => sum + (i.actual_hours_sum || 0), 0)
  );

  return {
    filter: {
      plan_id: planId ? Number(planId) : null,
      start: start || null,
      end: end || null,
    },
    today_kst: todayKst,
    total_count: items.length,
    completed_count: items.filter((i) => i.is_completed).length,
    delayed_count: items.filter((i) => i.is_delayed).length,
    blocked_count: items.filter((i) => i.is_blocked).length,
    // 아무 할 일도 없으면(=items가 비어 있으면) 0/0/0이 됩니다.
    estimated_hours_sum: estimatedSum,
    actual_hours_sum: actualSum,
    diff_hours: round2(actualSum - estimatedSum),
    items,
  };
}

// 카드 5 "내 것으로 채우고, 잃지 않게": 내 자료 전체를 파일 하나로
// 빼낼 수 있게 합니다. 화면에 보여주는 값을 다시 조합한 게 아니라,
// 표 네 개(계획/계획 이력/할 일/실행 기록)를 있는 그대로 담습니다.
// 전부 이 사람(userId) 소유로만 걸러서 담습니다.
export function exportAll(userId) {
  const plans = getDb()
    .prepare(`SELECT * FROM plans WHERE user_id = ? ORDER BY id`)
    .all(userId);
  const planIds = plans.map((p) => p.id);
  const placeholders = planIds.length ? planIds.map(() => "?").join(",") : "0";

  const planVersions = planIds.length
    ? getDb()
        .prepare(
          `SELECT * FROM plan_versions WHERE plan_id IN (${placeholders}) ORDER BY id`
        )
        .all(...planIds)
    : [];

  const todos = planIds.length
    ? getDb()
        .prepare(
          `SELECT * FROM todos WHERE plan_id IN (${placeholders}) ORDER BY id`
        )
        .all(...planIds)
    : [];
  const todoIds = todos.map((t) => t.id);
  const todoPlaceholders = todoIds.length ? todoIds.map(() => "?").join(",") : "0";

  const executionLogs = todoIds.length
    ? getDb()
        .prepare(
          `SELECT * FROM execution_logs WHERE todo_id IN (${todoPlaceholders}) ORDER BY id`
        )
        .all(...todoIds)
    : [];

  return {
    exported_at: nowIso(),
    plans,
    plan_versions: planVersions,
    todos,
    execution_logs: executionLogs,
  };
}

export function listExecutionLogs({ userId, todoId, planId } = {}) {
  let rows = getDb()
    .prepare(
      `SELECT e.*, t.title AS todo_title, t.plan_id AS plan_id, p.title AS plan_title
       FROM execution_logs e
       JOIN todos t ON t.id = e.todo_id
       JOIN plans p ON p.id = t.plan_id
       WHERE p.user_id = ?
       ORDER BY e.start_time DESC, e.id DESC`
    )
    .all(userId);

  if (todoId) {
    rows = rows.filter((r) => r.todo_id === Number(todoId));
  }
  if (planId) {
    rows = rows.filter((r) => r.plan_id === Number(planId));
  }
  return rows;
}
