import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DATA_DIR || './data';
fs.mkdirSync(dir, { recursive: true });
export const db = new Database(path.join(dir, 'dayline.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  voice TEXT NOT NULL,
  intro TEXT NOT NULL,
  o1_prompt TEXT NOT NULL, o1_type TEXT NOT NULL, o1_text TEXT NOT NULL, o1_url TEXT NOT NULL DEFAULT '',
  o2_prompt TEXT NOT NULL, o2_type TEXT NOT NULL, o2_text TEXT NOT NULL, o2_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  calls INTEGER NOT NULL DEFAULT 0,
  scrubbed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_expiry ON projects(status, expires_at);
`);
