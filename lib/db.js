// 서버에서만 실행되는 파일입니다 (브라우저에서 직접 불러오지 않음).
//
// SQLite를 쓰는데, npm으로 따로 설치하는 라이브러리(better-sqlite3) 대신
// Node.js 안에 이미 들어있는 node:sqlite를 씁니다. 그래서 컴퓨터마다
// 빌드 도구가 있어야 하는 문제 없이, npm install만 하면 바로 됩니다.

import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "plando.db");

// 같은 서버 안에서 연결을 하나만 유지합니다 (Next.js 개발 모드에서
// 파일이 여러 번 로드돼도 새 연결을 계속 만들지 않도록).
let db = globalThis.__plandoDb;
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

function nowIso() {
  return new Date().toISOString();
}

export function listPlans() {
  const plans = db
    .prepare(`SELECT * FROM plans ORDER BY created_at DESC`)
    .all();
  const countStmt = db.prepare(
    `SELECT COUNT(*) AS c FROM plan_versions WHERE plan_id = ?`
  );
  return plans.map((p) => ({
    ...p,
    history_count: Number(countStmt.get(p.id).c),
  }));
}

export function createPlan(data) {
  const ts = nowIso();
  const stmt = db.prepare(`
    INSERT INTO plans
      (title, start_date, end_date, priority, success_criteria, estimated_hours, created_at, updated_at)
    VALUES (@title, @start_date, @end_date, @priority, @success_criteria, @estimated_hours, @created_at, @updated_at)
  `);
  const info = stmt.run({
    title: data.title,
    start_date: data.start_date,
    end_date: data.end_date,
    priority: data.priority,
    success_criteria: data.success_criteria,
    estimated_hours: data.estimated_hours,
    created_at: ts,
    updated_at: ts,
  });
  const newId = Number(info.lastInsertRowid);
  return db.prepare(`SELECT * FROM plans WHERE id = ?`).get(newId);
}

// 계획을 수정할 때: 지금 값을 이력 표에 먼저 저장한 다음에만
// plans 테이블 값을 바꿉니다. 그래서 "고치기 전" 내용이 사라지지 않습니다.
export function updatePlan(id, data) {
  const current = db.prepare(`SELECT * FROM plans WHERE id = ?`).get(id);
  if (!current) return null;

  const nextVersionNo =
    (db
      .prepare(
        `SELECT COALESCE(MAX(version_no), 0) AS m FROM plan_versions WHERE plan_id = ?`
      )
      .get(id).m || 0) + 1;

  db.exec("BEGIN");
  try {
    db.prepare(`
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

    db.prepare(`
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
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return db.prepare(`SELECT * FROM plans WHERE id = ?`).get(id);
}

export function getPlanHistory(id) {
  return db
    .prepare(
      `SELECT * FROM plan_versions WHERE plan_id = ? ORDER BY version_no DESC`
    )
    .all(id);
}
