import Database from "better-sqlite3";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";

const dataDir = process.env.STAFFUP_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "staffup.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  action TEXT NOT NULL,
  log TEXT NOT NULL DEFAULT ''
);
`);

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.prepare(
    "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, value);
}

export function deleteSetting(key: string) {
  db.prepare("DELETE FROM settings WHERE key=?").run(key);
}

export function getServiceRow(id: string) {
  return db.prepare("SELECT * FROM services WHERE id=?").get(id) as
    | { id: string; enabled: number; config: string; updated_at: string }
    | undefined;
}

export function listServiceRows() {
  return db.prepare("SELECT * FROM services").all() as Array<{
    id: string;
    enabled: number;
    config: string;
    updated_at: string;
  }>;
}

export function setServiceEnabled(id: string, enabled: boolean, config?: object) {
  const existing = getServiceRow(id);
  if (existing) {
    db.prepare(
      "UPDATE services SET enabled=?, config=?, updated_at=datetime('now') WHERE id=?"
    ).run(enabled ? 1 : 0, JSON.stringify(config ?? JSON.parse(existing.config)), id);
  } else {
    db.prepare(
      "INSERT INTO services (id, enabled, config) VALUES (?,?,?)"
    ).run(id, enabled ? 1 : 0, JSON.stringify(config ?? {}));
  }
}

export function saveServiceConfig(id: string, config: object) {
  const existing = getServiceRow(id);
  if (existing) {
    db.prepare(
      "UPDATE services SET config=?, updated_at=datetime('now') WHERE id=?"
    ).run(JSON.stringify(config), id);
  } else {
    db.prepare("INSERT INTO services (id, enabled, config) VALUES (?,0,?)").run(
      id,
      JSON.stringify(config)
    );
  }
}

export function randomSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}