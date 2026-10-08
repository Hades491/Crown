import crypto from 'node:crypto';
import { db } from './db.js';
import { LANGUAGES, VOICES, ACTIONS } from './catalog.js';
import { statusOf } from './engine.js';

export const LIFETIME_MS = 24 * 3600 * 1000;
export const MAX_ACTIVE_PER_USER = 3;
const SCRUB_AFTER_MS = 72 * 3600 * 1000;   // wipe caller-facing text 3 days after expiry

const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Validate and normalise the create-form payload. Returns { error } or { value }. */
export function validateProject(b = {}) {
  const v = {
    name: clean(b.name), language: clean(b.language), voice: clean(b.voice), intro: clean(b.intro),
  };
  const need = (key, label, max) => {
    if (!v[key]) return `${label} is required.`;
    if (v[key].length > max) return `${label} must be ${max} characters or fewer.`;
  };
  let err = need('name', 'Project name', 60) || need('intro', 'Introduction', 400);
  if (err) return { error: err };
  if (!LANGUAGES.some((l) => l.code === v.language)) return { error: 'Choose a supported language.' };
  if (!VOICES.includes(v.voice)) return { error: 'Choose a voice.' };

  for (const n of [1, 2]) {
    const o = b[`option${n}`] || {};
    const prompt = clean(o.prompt), type = clean(o.type), text = clean(o.text);
    let url = clean(o.url);
    if (!prompt || prompt.length > 200) return { error: `Option ${n}: the prompt is required (200 characters max).` };
    if (!ACTIONS.includes(type)) return { error: `Option ${n}: choose what happens.` };
    if (!text || text.length > 600) return { error: `Option ${n}: the response is required (600 characters max).` };
    if (type === 'link') {
      if (url) {
        try {
          const u = new URL(url);
          if (u.protocol !== 'https:' && u.protocol !== 'http:') throw 0;
          url = u.toString();
        } catch { return { error: `Option ${n}: enter a valid web address starting with https://` }; }
        if (url.length > 300) return { error: `Option ${n}: the web address is too long.` };
      }
    } else url = '';
    v[`o${n}_prompt`] = prompt; v[`o${n}_type`] = type; v[`o${n}_text`] = text; v[`o${n}_url`] = url;
  }
  return { value: v };
}

function newCode() {
  for (let i = 0; i < 20; i++) {
    const code = String(crypto.randomInt(10_000_000, 100_000_000));   // 8 digits, no leading zero
    if (!db.prepare('SELECT 1 FROM projects WHERE code = ?').get(code)) return code;
  }
  throw new Error('Could not allocate a line number');
}

export function createProject(userId, v, now = Date.now()) {
  const active = db.prepare("SELECT COUNT(*) c FROM projects WHERE user_id = ? AND status = 'active' AND expires_at > ?").get(userId, now).c;
  if (active >= MAX_ACTIVE_PER_USER) return { error: `You can have ${MAX_ACTIVE_PER_USER} live lines at a time. End one or wait for it to expire.` };
  const code = newCode();
  const info = db.prepare(`INSERT INTO projects
    (user_id, code, name, language, voice, intro, o1_prompt, o1_type, o1_text, o1_url, o2_prompt, o2_type, o2_text, o2_url, created_at, expires_at)
    VALUES (@user_id, @code, @name, @language, @voice, @intro, @o1_prompt, @o1_type, @o1_text, @o1_url, @o2_prompt, @o2_type, @o2_text, @o2_url, @created_at, @expires_at)`)
    .run({ ...v, user_id: userId, code, created_at: now, expires_at: now + LIFETIME_MS });
  return { project: getById(info.lastInsertRowid) };
}

export const getById = (id) => db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
export const getByCode = (code) => db.prepare('SELECT * FROM projects WHERE code = ?').get(code);
export const listForUser = (userId) => db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId);

export function endProject(userId, id) {
  return db.prepare("UPDATE projects SET status = 'ended', expires_at = MIN(expires_at, ?) WHERE id = ? AND user_id = ? AND status = 'active'")
    .run(Date.now(), id, userId).changes > 0;
}

/** What the owner sees. */
export function ownerView(p, now = Date.now()) {
  return {
    id: p.id, code: p.code, name: p.name, language: p.language, voice: p.voice,
    intro: p.intro, option1: { prompt: p.o1_prompt, type: p.o1_type, text: p.o1_text, url: p.o1_url },
    option2: { prompt: p.o2_prompt, type: p.o2_type, text: p.o2_text, url: p.o2_url },
    created_at: p.created_at, expires_at: p.expires_at, calls: p.calls, status: statusOf(p, now),
  };
}
/** What a caller sees before dialling. */
export function publicView(p, now = Date.now()) {
  return { code: p.code, name: p.name, language: p.language, voice: p.voice, expires_at: p.expires_at, status: statusOf(p, now) };
}

/** Run every 30s: close lines whose 24 hours are up, and wipe their text later. */
export function sweep(now = Date.now()) {
  const closed = db.prepare("UPDATE projects SET status = 'expired' WHERE status = 'active' AND expires_at <= ?").run(now).changes;
  const scrubbed = db.prepare(`UPDATE projects SET scrubbed = 1, intro = '', o1_prompt = '', o1_text = '', o1_url = '', o2_prompt = '', o2_text = '', o2_url = ''
    WHERE scrubbed = 0 AND status != 'active' AND expires_at <= ?`).run(now - SCRUB_AFTER_MS).changes;
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  return { closed, scrubbed };
}
