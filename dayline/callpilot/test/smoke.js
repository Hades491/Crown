import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dayline-'));
const { buildApp } = await import('../src/server.js');
const { db } = await import('../src/db.js');
const { sweep } = await import('../src/projects.js');

const server = buildApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
let cookie = '';
const call = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = (name) => console.log('  ✓', name);

const project = {
  name: 'School Event', language: 'en-IN', voice: 'female',
  intro: 'Hello, welcome to our school science exhibition.',
  option1: { prompt: 'Press 1 to know the event timings.', type: 'say', text: 'The exhibition runs from 9 AM to 4 PM on Saturday.' },
  option2: { prompt: 'Press 2 to know how to register.', type: 'link', text: 'Register at the link shown on your screen.', url: 'https://example.com/register' },
};

// auth
assert.equal((await call('GET', '/api/projects')).status, 401); ok('projects need login');
assert.equal((await call('POST', '/api/auth/signup', { email: 'bad', password: 'longenough' })).status, 400); ok('rejects bad email');
assert.equal((await call('POST', '/api/auth/signup', { email: 'a@b.co', password: 'short' })).status, 400); ok('rejects short password');
assert.equal((await call('POST', '/api/auth/signup', { email: 'A@b.co', password: 'longenough' })).status, 200); ok('signs up');
assert.equal((await call('POST', '/api/auth/signup', { email: 'a@b.co', password: 'longenough' })).status, 409); ok('blocks duplicate email');

// validation
assert.equal((await call('POST', '/api/projects', { ...project, language: 'xx' })).status, 400); ok('rejects unknown language');
assert.equal((await call('POST', '/api/projects', { ...project, option2: { ...project.option2, url: 'javascript:alert(1)' } })).status, 400); ok('rejects javascript: links');

// create + 24h lifetime
const created = await call('POST', '/api/projects', project);
assert.equal(created.status, 201);
const line = created.body.project;
assert.match(line.code, /^[1-9]\d{7}$/);
assert.equal(line.expires_at - line.created_at, 24 * 3600 * 1000); ok(`creates line ${line.code} that lives exactly 24h`);

// call flow
let t = await call('POST', `/api/lines/${line.code}/turn`, { start: true });
assert.equal(t.body.status, 'active');
assert.equal(t.body.steps[0].text, project.intro);
assert.equal(t.body.steps.at(-1).t, 'gather'); ok('answers with intro, both options, then listens');
t = await call('POST', `/api/lines/${line.code}/turn`, { digit: '1' });
assert.match(t.body.steps[0].text, /9 AM to 4 PM/); ok('press 1 -> action 1');
t = await call('POST', `/api/lines/${line.code}/turn`, { digit: '2' });
assert.ok(t.body.steps.some((s) => s.t === 'card' && s.url === 'https://example.com/register')); ok('press 2 -> link card');
t = await call('POST', `/api/lines/${line.code}/turn`, { speech: 'option one please' });
assert.match(t.body.steps[0].text, /9 AM/); ok('spoken "one" works');
t = await call('POST', `/api/lines/${line.code}/turn`, { digit: '7', attempt: 0 });
assert.equal(t.body.attempt, 1); assert.match(t.body.steps[0].text, /Sorry/); ok('invalid key re-prompts');
t = await call('POST', `/api/lines/${line.code}/turn`, { digit: '7', attempt: 2 });
assert.equal(t.body.steps.at(-1).t, 'hangup'); ok('hangs up after 3 misses');
assert.equal((await call('GET', '/api/projects')).body.projects[0].calls, 1); ok('counts calls');

// limit of 3 live lines
await call('POST', '/api/projects', project); await call('POST', '/api/projects', project);
assert.equal((await call('POST', '/api/projects', project)).status, 409); ok('caps live lines at 3');

// expiry
db.prepare('UPDATE projects SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, line.id);
t = await call('POST', `/api/lines/${line.code}/turn`, { start: true });
assert.equal(t.body.status, 'expired');
assert.equal(t.body.steps[0].text, 'This service is no longer available.');
assert.equal(t.body.steps[1].t, 'hangup'); ok('after 24h: "This service is no longer available."');
assert.equal(sweep().closed, 1); ok('sweeper marks it expired');
db.prepare('UPDATE projects SET expires_at = ? WHERE id = ?').run(Date.now() - 4 * 24 * 3600 * 1000, line.id);
assert.equal(sweep().scrubbed, 1);
assert.equal(db.prepare('SELECT intro FROM projects WHERE id = ?').get(line.id).intro, ''); ok('content wiped 3 days after expiry');

// ending early + unknown lines
const second = (await call('GET', '/api/projects')).body.projects.find((p) => p.status === 'active');
assert.equal((await call('DELETE', `/api/projects/${second.id}`)).status, 200);
assert.equal((await call('POST', `/api/lines/${second.code}/turn`, { start: true })).body.status, 'ended'); ok('owner can end a line early');
assert.equal((await call('GET', '/api/lines/00000000')).status, 404); ok('unknown number -> 404');

server.close();
console.log('\nAll checks passed.');
