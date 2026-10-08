import { h, api, fmtCode, remaining, LIFETIME } from './common.js';

const view = document.getElementById('view');
const code = location.pathname.split('/').pop();
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const GATHER_TIMEOUT_MS = 10_000;

let line = null, attempt = 0, callId = 0, inCall = false, awaiting = false, gatherTimer = null, rec = null, noVoiceWarned = false;
const el = {};

// ---------- voices ----------
function pickVoice(lang, gender) {
  const voices = synth ? synth.getVoices() : [];
  const norm = (v) => v.lang.replace('_', '-').toLowerCase();
  const exact = voices.filter((v) => norm(v) === lang.toLowerCase());
  const base = lang.split('-')[0].toLowerCase();
  const pool = exact.length ? exact : voices.filter((v) => norm(v).split('-')[0] === base);
  if (!pool.length) return null;
  const fem = /female|woman|zira|samantha|aditi|kajal|heera|lekha|veena|priya|raveena|susan|hazel|google (hindi|bengali|tamil|telugu|marathi)/i;
  const mal = /\bmale\b|\bman\b|david|mark|rishi|hemant|ravi|prabhat|daniel|george|alex/i;
  return pool.find((v) => (gender === 'female' ? fem : mal).test(v.name)) || pool[0];
}

function speak(text) {
  return new Promise((resolve) => {
    const id = callId;
    const fallback = Math.max(900, text.length * 70);
    if (!synth || !line) return setTimeout(resolve, fallback);
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = line.language;
    const v = pickVoice(line.language, line.voice);
    if (v) u.voice = v;
    else if (!noVoiceWarned) { noVoiceWarned = true; sys('Your device has no voice for this language, so you will see captions instead.'); }
    u.rate = 0.97;
    const safety = setTimeout(done, Math.max(4000, text.length * 150));
    function done() { clearTimeout(safety); resolve(); }
    u.onend = done; u.onerror = done;
    if (id !== callId) return resolve();
    synth.speak(u);
  });
}

// ---------- captions ----------
const log = h('div', { class: 'cap', 'aria-live': 'polite', 'aria-label': 'Call transcript' });
const add = (node) => { log.append(node); log.scrollTop = log.scrollHeight; };
const caption = (t) => add(h('p', {}, t));
const you = (t) => add(h('p', { class: 'you' }, t));
const sys = (t) => add(h('p', { class: 'sys' }, t));
const setStatus = (t, listening = false) => { el.status.textContent = t; el.status.className = 'status' + (listening ? ' listen' : ''); };

// ---------- call flow ----------
async function turn(body) {
  const data = await api('POST', `/api/lines/${code}/turn`, { ...body, attempt });
  attempt = data.attempt; line = data.line;
  return data;
}

async function play(steps, id) {
  for (const s of steps) {
    if (id !== callId) return;
    if (s.t === 'say') { setStatus('Speaking…'); caption(s.text); await speak(s.text); }
    else if (s.t === 'card') {
      if (s.url) add(h('a', { class: 'card', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.url));
    } else if (s.t === 'gather') { listen(id); return; }
    else if (s.t === 'hangup') { return endCall(false); }
  }
}

function listen(id) {
  awaiting = true; setStatus('Press 1 or 2, or say your choice', true);
  el.mic.hidden = !SR;
  clearTimeout(gatherTimer);
  gatherTimer = setTimeout(() => { if (id === callId && awaiting) respond({ timeout: true }, null); }, GATHER_TIMEOUT_MS);
}

async function respond(input, label) {
  if (!inCall) return;
  clearTimeout(gatherTimer); stopMic(); if (synth) synth.cancel();
  awaiting = false;
  if (label) you(label);
  const id = ++callId;
  try { const data = await turn(input); updateRing(); await play(data.steps, id); }
  catch (e) { sys(e.message); endCall(false); }
}

async function startCall() {
  if (inCall) return;
  inCall = true; attempt = 0; const id = ++callId;
  log.replaceChildren();
  el.call.hidden = true; el.hang.hidden = false; sys('Connected');
  try { const data = await turn({ start: true }); updateRing(); await play(data.steps, id); }
  catch (e) { sys(e.message); endCall(false); }
}

function endCall(userInitiated = true) {
  if (userInitiated) sys('You hung up');
  else sys('Call ended');
  inCall = false; awaiting = false; callId++; clearTimeout(gatherTimer); stopMic();
  if (synth) synth.cancel();
  el.call.hidden = false; el.hang.hidden = true; el.mic.hidden = true;
  el.call.textContent = line && line.status === 'active' ? 'Call again' : 'Call';
  setStatus('');
}

// ---------- mic ----------
function toggleMic() {
  if (!SR || !awaiting) return;
  if (rec) return stopMic();
  if (synth) synth.cancel();
  rec = new SR(); rec.lang = line.language; rec.interimResults = false; rec.maxAlternatives = 3;
  setStatus('Listening… say "one" or "two"', true); el.mic.classList.add('on');
  rec.onresult = (ev) => {
    const alts = [...ev.results[0]].map((a) => a.transcript);
    stopMic(); respond({ speech: alts.join(' ') }, alts[0]);
  };
  rec.onerror = () => { stopMic(); setStatus('Could not hear you. Use the keypad or try again.', true); };
  rec.onend = () => { if (rec) stopMic(); };
  try { rec.start(); } catch { stopMic(); }
}
function stopMic() { if (rec) { const r = rec; rec = null; try { r.stop(); } catch { /* already stopped */ } } el.mic && el.mic.classList.remove('on'); }

// ---------- keypad ----------
function press(d) {
  if (!inCall) return;
  if (!/^[0-9*#]$/.test(d)) return;
  respond({ digit: d }, d);
}

// ---------- countdown ring ----------
const R = 62, C = 2 * Math.PI * R;
function updateRing() {
  if (!line) return;
  const r = remaining(line.expires_at);
  const active = line.status === 'active' && r.ms > 0;
  el.prog.setAttribute('stroke-dashoffset', String(C * (1 - (active ? r.ms / LIFETIME : 0))));
  el.ring.className = 'ring' + (!active ? ' off' : r.soon ? ' soon' : '');
  el.t1.textContent = active ? r.text : line.status === 'ended' ? 'Ended' : 'Closed';
  el.t2.textContent = active ? 'left on this line' : 'no longer available';
  if (!active && line.status === 'active') line = { ...line, status: 'expired' };
}

// ---------- render ----------
function render() {
  document.title = `${line.name} | Dayline`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 150 150'); svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  for (const [k, v] of Object.entries({ class: 'track', cx: 75, cy: 75, r: R })) track.setAttribute(k, v);
  const prog = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  for (const [k, v] of Object.entries({ class: 'prog', cx: 75, cy: 75, r: R, 'stroke-dasharray': String(C), 'stroke-dashoffset': '0' })) prog.setAttribute(k, v);
  svg.append(track, prog); el.prog = prog;
  el.t1 = h('b'); el.t2 = h('span');
  el.ring = h('div', { class: 'ring', role: 'img', 'aria-label': 'Time remaining on this line' }, svg, h('div', { class: 't' }, el.t1, el.t2));
  el.status = h('p', { class: 'status', 'aria-live': 'polite' });
  el.call = h('button', { class: 'btn primary', onclick: startCall }, 'Call');
  el.hang = h('button', { class: 'btn hangup', hidden: true, onclick: () => endCall(true) }, 'Hang up');
  el.mic = h('button', { class: 'btn', hidden: true, onclick: toggleMic, 'aria-label': 'Speak your choice' }, '🎙 Speak');
  const letters = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ' };
  el.keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) =>
    h('button', { class: 'key', type: 'button', onclick: () => press(k), 'aria-label': k }, h('span', {}, k, letters[k] ? h('small', {}, letters[k]) : null)));

  view.replaceChildren(h('div', { class: 'phone' },
    h('div', { class: 'who' }, h('h1', { class: 'sr' }, line.name), h('h2', {}, line.name), h('p', {}, 'AI phone line')),
    el.ring, h('div', { class: 'callnum' }, fmtCode(line.code)),
    log, el.status,
    h('div', { class: 'pad small' }, el.keys),
    h('div', { class: 'actions' }, el.call, el.mic, el.hang),
    h('p', { class: 'note' }, 'This is a temporary line. You are talking to an automated AI assistant.')));
  updateRing(); setInterval(updateRing, 1000);
  if (line.status !== 'active') sys('This line is closed. Press Call to hear what callers hear.');
  document.addEventListener('keydown', (e) => { if (inCall && /^[0-9*#]$/.test(e.key) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) press(e.key); });
}

(async () => {
  if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => {};
  try {
    if (!/^\d{8}$/.test(code)) throw new Error('That is not a valid line number.');
    line = (await api('GET', `/api/lines/${code}`)).line;
    render();
  } catch (e) {
    view.replaceChildren(h('div', { class: 'phone' }, h('div', { class: 'who' }, h('h2', {}, 'No such line'), h('p', {}, e.message)),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '/' }, 'Dial another number'))));
  }
})();
