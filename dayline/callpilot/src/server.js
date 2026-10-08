import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { LANGUAGES, VOICES } from './catalog.js';
import { runTurn, statusOf } from './engine.js';
import {
  hashPassword, checkPassword, createSession, destroySession, userForToken,
  parseCookies, SESSION_COOKIE, cookieOptions, limit,
} from './security.js';
import {
  validateProject, createProject, getByCode, listForUser, endProject, ownerView, publicView, sweep, LIFETIME_MS,
} from './projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD = process.env.NODE_ENV === 'production';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
    });
    if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use(express.json({ limit: '20kb' }));

  // Same-origin only for state-changing requests.
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET') {
      const origin = req.get('origin');
      if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request blocked.' });
    }
    next();
  });

  const auth = (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const user = userForToken(token);
    if (!user) return res.status(401).json({ error: 'Please log in.' });
    req.user = user; req.token = token; next();
  };

  // ---------- accounts ----------
  const emailOk = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  app.post('/api/auth/signup', limit('signup', 10, 3600_000), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
    const info = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?,?,?)').run(email, await hashPassword(password), Date.now());
    res.cookie(SESSION_COOKIE, createSession(info.lastInsertRowid), cookieOptions(PROD));
    res.json({ user: { email } });
  });

  app.post('/api/auth/login', limit('login', 20, 900_000), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = u && await checkPassword(String(req.body?.password || ''), u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.cookie(SESSION_COOKIE, createSession(u.id), cookieOptions(PROD));
    res.json({ user: { email: u.email } });
  });

  app.post('/api/auth/logout', (req, res) => {
    destroySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => {
    const user = userForToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.json({ user: user ? { email: user.email } : null });
  });

  app.get('/api/catalog', (req, res) => res.json({ languages: LANGUAGES, voices: VOICES, lifetimeHours: LIFETIME_MS / 3600_000 }));

  // ---------- projects (owner) ----------
  app.get('/api/projects', auth, (req, res) => res.json({ projects: listForUser(req.user.id).map((p) => ownerView(p)) }));

  app.post('/api/projects', auth, limit('create', 20, 3600_000, (r) => r.user.id), (req, res) => {
    const { error, value } = validateProject(req.body);
    if (error) return res.status(400).json({ error });
    const out = createProject(req.user.id, value);
    if (out.error) return res.status(409).json({ error: out.error });
    res.status(201).json({ project: ownerView(out.project) });
  });

  app.delete('/api/projects/:id', auth, (req, res) => {
    const ok = endProject(req.user.id, Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'That line is not live.' });
    res.json({ ok: true });
  });

  // ---------- the line (public: anyone with the number can call) ----------
  const codeOk = (c) => /^\d{8}$/.test(c);

  app.get('/api/lines/:code', limit('line-info', 60, 60_000), (req, res) => {
    const p = codeOk(req.params.code) && getByCode(req.params.code);
    if (!p) return res.status(404).json({ error: 'No line with that number.' });
    res.json({ line: publicView(p) });
  });

  app.post('/api/lines/:code/turn', limit('turn', 120, 60_000), (req, res) => {
    const p = codeOk(req.params.code) && getByCode(req.params.code);
    if (!p) return res.status(404).json({ error: 'No line with that number.' });
    const b = req.body || {};
    const input = {
      start: b.start === true,
      timeout: b.timeout === true,
      digit: typeof b.digit === 'string' ? b.digit.slice(0, 1) : undefined,
      speech: typeof b.speech === 'string' ? b.speech.slice(0, 200) : undefined,
      attempt: Math.min(Number(b.attempt) || 0, 10),
    };
    if (input.start && statusOf(p) === 'active') db.prepare('UPDATE projects SET calls = calls + 1 WHERE id = ?').run(p.id);
    res.json({ ...runTurn(p, input), line: publicView(p) });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---------- pages ----------
  app.get('/c/:code', (req, res) => res.sendFile(path.join(__dirname, '../public/call.html')));
  app.use(express.static(path.join(__dirname, '../public'), { maxAge: PROD ? '1h' : 0 }));

  app.use((err, req, res, next) => {            // eslint-disable-line no-unused-vars
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? 'Bad request.' : 'Something went wrong on our side.' });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  sweep();
  setInterval(() => { try { sweep(); } catch (e) { console.error('sweep failed', e); } }, 30_000).unref();
  const port = Number(process.env.PORT) || 3000;
  buildApp().listen(port, () => console.log(`Dayline listening on :${port}`));
}
