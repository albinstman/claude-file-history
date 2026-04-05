import initSqlJs, { type Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { DB_DIR, DB_PATH } from './constants';
import type { EventRecord, SessionRecord, SessionResult } from './types';

export type { Database } from 'sql.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
    session_id      TEXT PRIMARY KEY,
    project_root    TEXT NOT NULL,
    git_branch      TEXT,
    started_at      TEXT,
    last_seen_at    TEXT,
    source          TEXT NOT NULL,
    model           TEXT,
    transcript_path TEXT,
    summary         TEXT,
    user_prompts    TEXT
);

CREATE TABLE IF NOT EXISTS events (
    event_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL REFERENCES sessions(session_id),
    timestamp     TEXT NOT NULL,
    project_root  TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    tool_name     TEXT NOT NULL,
    tool_use_id   TEXT,
    git_branch    TEXT,
    git_sha       TEXT,
    confidence    TEXT NOT NULL DEFAULT 'explicit',
    source        TEXT NOT NULL DEFAULT 'hook'
);

CREATE TABLE IF NOT EXISTS file_index (
    file_path     TEXT NOT NULL,
    session_id    TEXT NOT NULL REFERENCES sessions(session_id),
    first_seen    TEXT NOT NULL,
    last_seen     TEXT NOT NULL,
    tool_names    TEXT NOT NULL,
    event_count   INTEGER NOT NULL DEFAULT 1,
    confidence    TEXT NOT NULL DEFAULT 'explicit',
    PRIMARY KEY (file_path, session_id)
);

CREATE TABLE IF NOT EXISTS backfill_state (
    jsonl_path    TEXT PRIMARY KEY,
    last_offset   INTEGER NOT NULL DEFAULT 0,
    completed     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_events_file_path ON events(file_path);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_file_index_file ON file_index(file_path);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_root);
`;

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

function getSql(): ReturnType<typeof initSqlJs> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  return sqlPromise;
}

export async function openDatabase(readonly = false): Promise<Database> {
  const SQL = await getSql();
  fs.mkdirSync(DB_DIR, { recursive: true });

  let db: Database;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  if (!readonly) {
    db.run(SCHEMA);
    // Migrate: add columns if upgrading from older schema
    try { db.run('ALTER TABLE sessions ADD COLUMN summary TEXT'); } catch { /* already exists */ }
    try { db.run('ALTER TABLE sessions ADD COLUMN user_prompts TEXT'); } catch { /* already exists */ }
  }

  return db;
}

export function saveDatabase(db: Database): void {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export function upsertSession(db: Database, session: SessionRecord): void {
  const userPromptsJson = session.user_prompts ? JSON.stringify(session.user_prompts) : null;
  db.run(
    `INSERT INTO sessions (session_id, project_root, git_branch, started_at, last_seen_at, source, model, transcript_path, summary, user_prompts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       last_seen_at = excluded.started_at,
       git_branch = COALESCE(excluded.git_branch, sessions.git_branch),
       model = COALESCE(excluded.model, sessions.model),
       transcript_path = COALESCE(excluded.transcript_path, sessions.transcript_path),
       summary = CASE WHEN excluded.summary IS NOT NULL THEN excluded.summary ELSE sessions.summary END,
       user_prompts = CASE WHEN excluded.user_prompts IS NOT NULL THEN excluded.user_prompts ELSE sessions.user_prompts END`,
    [
      session.session_id,
      session.project_root,
      session.git_branch ?? null,
      session.started_at,
      session.started_at,
      session.source,
      session.model ?? null,
      session.transcript_path ?? null,
      session.summary ?? null,
      userPromptsJson,
    ]
  );
}

export function insertEvent(db: Database, event: EventRecord): void {
  // Ensure session exists
  db.run(
    `INSERT OR IGNORE INTO sessions (session_id, project_root, git_branch, started_at, last_seen_at, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.session_id, event.project_root, event.git_branch ?? null, event.timestamp, event.timestamp, event.source]
  );

  // Update session last_seen_at
  db.run(
    `UPDATE sessions SET last_seen_at = MAX(last_seen_at, ?) WHERE session_id = ?`,
    [event.timestamp, event.session_id]
  );

  // Insert event
  db.run(
    `INSERT INTO events (session_id, timestamp, project_root, file_path, tool_name, tool_use_id, git_branch, git_sha, confidence, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.session_id,
      event.timestamp,
      event.project_root,
      event.file_path,
      event.tool_name,
      event.tool_use_id ?? null,
      event.git_branch ?? null,
      event.git_sha ?? null,
      event.confidence,
      event.source,
    ]
  );

  // Upsert file_index
  const toolNamesJson = JSON.stringify([event.tool_name]);

  // Check if row exists
  const existing = db.exec(
    `SELECT tool_names, confidence FROM file_index WHERE file_path = ? AND session_id = ?`,
    [event.file_path, event.session_id]
  );

  if (existing.length > 0 && existing[0].values.length > 0) {
    const row = existing[0].values[0];
    const existingTools: string[] = JSON.parse(row[0] as string);
    const existingConfidence = row[1] as string;

    if (!existingTools.includes(event.tool_name)) {
      existingTools.push(event.tool_name);
    }
    const newConfidence = event.confidence === 'explicit' ? 'explicit' : existingConfidence;

    db.run(
      `UPDATE file_index SET
        last_seen = MAX(last_seen, ?),
        event_count = event_count + 1,
        tool_names = ?,
        confidence = ?
       WHERE file_path = ? AND session_id = ?`,
      [event.timestamp, JSON.stringify(existingTools), newConfidence, event.file_path, event.session_id]
    );
  } else {
    db.run(
      `INSERT INTO file_index (file_path, session_id, first_seen, last_seen, tool_names, event_count, confidence)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [event.file_path, event.session_id, event.timestamp, event.timestamp, toolNamesJson, event.confidence]
    );
  }
}

export function insertEventsBatch(db: Database, events: EventRecord[]): void {
  db.run('BEGIN TRANSACTION');
  try {
    for (const event of events) {
      insertEvent(db, event);
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

export function querySessionsForFile(db: Database, filePath: string): SessionResult[] {
  const result = db.exec(
    `SELECT
      fi.file_path,
      fi.session_id,
      fi.first_seen,
      fi.last_seen,
      fi.tool_names,
      fi.event_count,
      fi.confidence,
      s.project_root,
      s.git_branch,
      s.model,
      s.transcript_path,
      s.summary,
      s.user_prompts
    FROM file_index fi
    JOIN sessions s ON fi.session_id = s.session_id
    WHERE fi.file_path = ?
    ORDER BY fi.last_seen DESC`,
    [filePath]
  );

  if (result.length === 0) return [];

  return result[0].values.map((row) => ({
    session_id: row[1] as string,
    project_root: row[7] as string,
    first_seen: row[2] as string,
    last_seen: row[3] as string,
    tool_names: JSON.parse(row[4] as string),
    event_count: row[5] as number,
    confidence: row[6] as 'explicit' | 'inferred',
    git_branch: (row[8] as string) ?? undefined,
    model: (row[9] as string) ?? undefined,
    transcript_path: (row[10] as string) ?? undefined,
    summary: (row[11] as string) ?? undefined,
    user_prompts: row[12] ? JSON.parse(row[12] as string) : undefined,
  }));
}

export function queryEventsForFileSession(
  db: Database,
  filePath: string,
  sessionId: string
): Array<Pick<EventRecord, 'timestamp' | 'tool_name' | 'tool_use_id' | 'confidence'>> {
  const result = db.exec(
    `SELECT timestamp, tool_name, tool_use_id, confidence
     FROM events
     WHERE file_path = ? AND session_id = ?
     ORDER BY timestamp ASC`,
    [filePath, sessionId]
  );

  if (result.length === 0) return [];

  return result[0].values.map((row) => ({
    timestamp: row[0] as string,
    tool_name: row[1] as string,
    tool_use_id: (row[2] as string) ?? undefined,
    confidence: row[3] as 'explicit' | 'inferred',
  }));
}

export function getBackfillState(db: Database, jsonlPath: string): { last_offset: number; completed: boolean } | null {
  const result = db.exec('SELECT last_offset, completed FROM backfill_state WHERE jsonl_path = ?', [jsonlPath]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const row = result[0].values[0];
  return { last_offset: row[0] as number, completed: (row[1] as number) === 1 };
}

export function updateBackfillState(db: Database, jsonlPath: string, offset: number, completed: boolean): void {
  db.run(
    `INSERT INTO backfill_state (jsonl_path, last_offset, completed)
     VALUES (?, ?, ?)
     ON CONFLICT(jsonl_path) DO UPDATE SET last_offset = excluded.last_offset, completed = excluded.completed`,
    [jsonlPath, offset, completed ? 1 : 0]
  );
}

export function resetBackfillIfGrown(db: Database, jsonlPath: string, currentSize: number): boolean {
  const state = getBackfillState(db, jsonlPath);
  if (!state) return true; // Never scanned — needs backfill
  if (!state.completed) return true; // Incomplete — needs backfill
  if (currentSize > state.last_offset) {
    // File has grown since last scan — reset and rescan
    updateBackfillState(db, jsonlPath, 0, false);
    return true;
  }
  return false; // Already fully scanned at this size
}
