// 서버에서만 실행되는 파일입니다 (브라우저에서 직접 불러오지 않음).
//
// SQLite를 쓰는데, npm으로 따로 설치하는 라이브러리(better-sqlite3) 대신
// Node.js 안에 이미 들어있는 node:sqlite를 씁니다. 그래서 컴퓨터마다
// 빌드 도구가 있어야 하는 문제 없이, npm install만 하면 바로 됩니다.

import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "plando.db");

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

// 우선순위 글자를 숫자로 바꿔서 "상 > 중 > 하" 순서로 비교할 수 있게 합니다.
const PRIORITY_RANK = { 상: 3, 중: 2, 하: 1 };

export function listPlans() {
  const plans = getDb()
    .prepare(`SELECT * FROM plans ORDER BY created_at DESC`)
    .all();
  const countStmt = getDb().prepare(
    `SELECT COUNT(*) AS c FROM plan_versions WHERE plan_id = ?`
  );
  return plans.map((p) => ({
    ...p,
    history_count: Number(countStmt.get(p.id).c),
  }));
}

export function createPlan(data) {
  const ts = nowIso();
  const stmt = getDb().prepare(`
    INSERT INTO plans
      (title, start_date, end_date, priority, success_criteria, estimated_hours, previous_lesson, created_at, updated_at)
    VALUES (@title, @start_date, @end_date, @priority, @success_criteria, @estimated_hours, @previous_lesson, @created_at, @updated_at)
  `);
  const info = stmt.run({
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
  return getDb().prepare(`SELECT * FROM plans WHERE id = ?`).get(newId);
}

// 계획을 수정할 때: 지금 값을 이력 표에 먼저 저장한 다음에만
// plans 테이블 값을 바꿉니다. 그래서 "고치기 전" 내용이 사라지지 않습니다.
export function updatePlan(id, data) {
  const current = getDb().prepare(`SELECT * FROM plans WHERE id = ?`).get(id);
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

  return getDb().prepare(`SELECT * FROM plans WHERE id = ?`).get(id);
}

export function getPlanHistory(id) {
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
export function listTodos({ planId, q, status, tag, sort } = {}) {
  let rows = getDb()
    .prepare(
      `SELECT t.*, p.title AS plan_title
       FROM todos t
       JOIN plans p ON p.id = t.plan_id`
    )
    .all();

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

export function getTodo(id) {
  return getDb().prepare(`SELECT * FROM todos WHERE id = ?`).get(id);
}

export function createTodo(data) {
  const ts = nowIso();
  const stmt = getDb().prepare(`
    INSERT INTO todos
      (plan_id, title, deadline, priority, tags, estimated_hours, status, created_at, updated_at)
    VALUES (@plan_id, @title, @deadline, @priority, @tags, @estimated_hours, '진행중', @created_at, @updated_at)
  `);
  const info = stmt.run({
    plan_id: Number(data.plan_id),
    title: data.title,
    deadline: data.deadline || null,
    priority: data.priority,
    tags: data.tags || "",
    estimated_hours: data.estimated_hours,
    created_at: ts,
    updated_at: ts,
  });
  return getTodo(Number(info.lastInsertRowid));
}

// 내용 수정 (제목·마감일·우선순위·태그·예상 시간). 상태(완료 여부)는
// setTodoStatus에서 따로 다룹니다.
export function updateTodo(id, data) {
  const current = getTodo(id);
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

  return getTodo(id);
}

// 다시 진행 중으로 되돌리기 (완료 → 진행중). 완료로 바꾸는 것은
// 실행 기록을 같이 남겨야 하므로 아래 completeTodo를 따로 씁니다.
export function revertTodoToInProgress(id) {
  const current = getTodo(id);
  if (!current) return null;
  getDb()
    .prepare(
      `UPDATE todos SET status = '진행중', updated_at = @updated_at WHERE id = @id`
    )
    .run({ id, updated_at: nowIso() });
  return getTodo(id);
}

export function deleteTodo(id) {
  const current = getTodo(id);
  if (!current) return false;
  getDb().prepare(`DELETE FROM todos WHERE id = ?`).run(id);
  return true;
}

// 할 일을 "완료"로 바꾸면서, 그 순간의 실행 기록(시작·끝·걸린 시간·막힌 이유)을
// 함께 저장합니다. 이미 완료 상태인 할 일에 또 완료를 시도하면
// (버튼을 연달아 두 번 눌러도) 아무 것도 새로 만들지 않고 그대로 돌려줍니다.
// "UPDATE ... WHERE status != '완료'"가 중복을 막는 실질적인 제약입니다.
export function completeTodo(id, { start_time, end_time, blocked_reason }) {
  const current = getTodo(id);
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
    todo: getTodo(id),
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
export function getReview({ planId, start, end } = {}) {
  let todos = getDb()
    .prepare(
      `SELECT t.*, p.title AS plan_title
       FROM todos t
       JOIN plans p ON p.id = t.plan_id`
    )
    .all();

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
export function exportAll() {
  return {
    exported_at: nowIso(),
    plans: getDb().prepare(`SELECT * FROM plans ORDER BY id`).all(),
    plan_versions: getDb()
      .prepare(`SELECT * FROM plan_versions ORDER BY id`)
      .all(),
    todos: getDb().prepare(`SELECT * FROM todos ORDER BY id`).all(),
    execution_logs: getDb()
      .prepare(`SELECT * FROM execution_logs ORDER BY id`)
      .all(),
  };
}

export function listExecutionLogs({ todoId, planId } = {}) {
  let rows = getDb()
    .prepare(
      `SELECT e.*, t.title AS todo_title, t.plan_id AS plan_id, p.title AS plan_title
       FROM execution_logs e
       JOIN todos t ON t.id = e.todo_id
       JOIN plans p ON p.id = t.plan_id
       ORDER BY e.start_time DESC, e.id DESC`
    )
    .all();

  if (todoId) {
    rows = rows.filter((r) => r.todo_id === Number(todoId));
  }
  if (planId) {
    rows = rows.filter((r) => r.plan_id === Number(planId));
  }
  return rows;
}
