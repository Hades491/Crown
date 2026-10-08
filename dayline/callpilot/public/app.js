import { h, api, fmtCode, remaining, LIFETIME, toast, copy } from './common.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const state = { user: null, catalog: null, timers: [] };
const clearTimers = () => { state.timers.forEach(clearInterval); state.timers = []; };

// ---------- boot ----------
async function boot() {
  const [me, cat] = await Promise.all([api('GET', '/api/me'), api('GET', '/api/catalog')]);
  state.user = me.user; state.catalog = cat;
  renderNav(); route();
}
window.addEventListener('hashchange', route);

function renderNav() {
  nav.replaceChildren(...(state.user ? [
    h('span', { class: 'who', text: state.user.email }),
    h('a', { class: 'btn small quiet', href: '#/lines' }, 'My lines'),
    h('button', { class: 'btn small', onclick: logout }, 'Log out'),
  ] : [
    h('button', { class: 'btn small quiet', onclick: () => authDialog('login') }, 'Log in'),
    h('button', { class: 'btn small primary', onclick: () => authDialog('signup') }, 'Sign up free'),
  ]));
}

function route() {
  clearTimers();
  const r = location.hash.replace(/^#/, '') || '/';
  const needsLogin = r === '/lines' || r === '/new';
  if (needsLogin && !state.user) { location.hash = '#/'; authDialog('signup'); return; }
  view.replaceChildren(r === '/lines' ? lines() : r === '/new' ? builder() : home());
  window.scrollTo(0, 0);
}

async function logout() {
  await api('POST', '/api/auth/logout'); state.user = null; renderNav(); location.hash = '#/'; route();
}

// ---------- auth ----------
function authDialog(mode) {
  const dlg = h('dialog');
  const err = h('div', { class: 'err', hidden: true, role: 'alert' });
  const email = h('input', { type: 'email', required: true, autocomplete: 'email', id: 'em' });
  const pw = h('input', { type: 'password', required: true, minlength: 8, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', id: 'pw' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, mode === 'signup' ? 'Create account' : 'Log in');
  const form = h('form', { method: 'dialog', onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; submit.disabled = true;
    try {
      const out = await api('POST', `/api/auth/${mode}`, { email: email.value, password: pw.value });
      state.user = out.user; renderNav(); dlg.close();
      location.hash = '#/lines'; route();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    finally { submit.disabled = false; }
  } },
    h('h2', {}, mode === 'signup' ? 'Create your free account' : 'Welcome back'),
    err,
    h('label', { class: 'field' }, h('span', {}, 'Email'), email),
    h('label', { class: 'field' }, h('span', {}, 'Password'), pw, mode === 'signup' ? h('small', {}, 'At least 8 characters.') : null),
    h('div', { class: 'row' }, submit,
      h('button', { class: 'btn quiet', type: 'button', onclick: () => { dlg.close(); authDialog(mode === 'signup' ? 'login' : 'signup'); } },
        mode === 'signup' ? 'I already have an account' : 'Create an account'),
      h('button', { class: 'btn quiet', type: 'button', onclick: () => dlg.close() }, 'Cancel')));
  dlg.append(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal(); email.focus();
}

// ---------- home ----------
function home() {
  const cta = () => state.user ? (location.hash = '#/new') : authDialog('signup');
  return h('div', {},
    h('section', { class: 'hero' },
      h('div', {},
        h('h1', {}, 'A phone line that lasts one day.'),
        h('p', { class: 'lede' }, 'Set up an AI agent that answers, offers two options and responds to your callers. Share its number. After 24 hours it hangs up for good.'),
        h('div', { class: 'cta' },
          h('button', { class: 'btn primary', onclick: cta }, 'Create a line'),
          h('a', { class: 'btn', href: '#how' }, 'How it works')),
        h('p', { class: 'fine' }, 'Callers need no app and no account. They just open the line.')),
      dialer()),
    h('section', { class: 'how', id: 'how' },
      h('h2', {}, 'From idea to answering calls in a minute'),
      h('ol', {},
        h('li', {}, h('h3', {}, 'Create'), h('p', {}, 'Name it, write what the agent says, choose a language and voice, and decide what happens for options 1 and 2.')),
        h('li', {}, h('h3', {}, 'Share'), h('p', {}, 'You get an 8-digit line number and a link. Send it to anyone. They tap, listen and press 1 or 2, or just say it.')),
        h('li', {}, h('h3', {}, 'It expires'), h('p', {}, 'Exactly 24 hours after creation the line answers "This service is no longer available." and stops working.')))));
}

function dialer() {
  let digits = '';
  const disp = h('div', { class: 'display', 'aria-live': 'polite' });
  const msg = h('p', { class: 'msg', role: 'alert' });
  const callBtn = h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Call');
  const draw = () => {
    const shown = digits ? (digits.length > 4 ? fmtCode(digits.padEnd(8, '\u2007')).trimEnd() : digits) : null;
    disp.replaceChildren(shown ? h('span', {}, shown) : h('span', { class: 'ph' }, 'Enter line number'),
      h('button', { type: 'button', 'aria-label': 'Delete last digit', onclick: () => { digits = digits.slice(0, -1); msg.textContent = ''; draw(); } }, '⌫'));
  };
  const press = (d) => { if (digits.length < 8) { digits += d; msg.textContent = ''; draw(); } };
  async function go() {
    if (digits.length !== 8) { msg.textContent = 'Line numbers have 8 digits.'; return; }
    try { await api('GET', `/api/lines/${digits}`); location.href = `/c/${digits}`; }
    catch (e) { msg.textContent = e.message; }
  }
  const letters = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ' };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''].map((k) =>
    k ? h('button', { class: 'key', type: 'button', onclick: () => press(k), 'aria-label': k }, h('span', {}, k, letters[k] ? h('small', {}, letters[k]) : null)) : h('span'));
  const box = h('div', { class: 'dialer', onkeydown: (e) => {
    if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') { digits = digits.slice(0, -1); draw(); } else if (e.key === 'Enter') go();
  } }, h('label', {}, 'Dial a Dayline'), disp, h('div', { class: 'pad' }, keys), callBtn, msg);
  draw(); return box;
}

// ---------- my lines ----------
function lines() {
  const list = h('div', { class: 'lines' });
  const wrap = h('div', {},
    h('div', { class: 'page-head' },
      h('div', {}, h('h2', {}, 'Your lines'), h('p', {}, 'Each line is live for 24 hours from the moment you create it.')),
      h('a', { class: 'btn primary', href: '#/new' }, '+ New line')),
    list);

  async function load() {
    const { projects } = await api('GET', '/api/projects');
    if (!projects.length) {
      list.replaceChildren(h('div', { class: 'panel empty' }, h('h3', {}, 'No lines yet'), h('p', {}, 'Create your first line and share its number.'), h('a', { class: 'btn primary', href: '#/new' }, 'Create a line')));
      return;
    }
    list.replaceChildren(...projects.map(card));
  }
  function card(p) {
    const link = `${location.origin}/c/${p.code}`;
    const live = p.status === 'active';
    const timer = h('p', { class: 'timer' }), fill = h('i'), bar = h('div', { class: 'bar' }, fill);
    const tick = () => {
      if (!live) { timer.textContent = p.status === 'ended' ? 'Ended by you' : 'Expired'; fill.style.width = '0%'; return; }
      const r = remaining(p.expires_at);
      if (r.ms === 0) { load(); return; }
      timer.textContent = `Hangs up in ${r.text}`; timer.className = 'timer' + (r.soon ? ' soon' : '');
      fill.style.width = `${(r.ms / LIFETIME) * 100}%`; fill.className = r.soon ? 'soon' : '';
    };
    tick(); if (live) state.timers.push(setInterval(tick, 1000));
    return h('article', { class: 'panel line-card' },
      h('header', {}, h('h3', {}, p.name), h('span', { class: 'pill ' + (live ? 'live' : 'done') }, live ? 'Live' : p.status === 'ended' ? 'Ended' : 'Expired')),
      h('div', { class: 'number', 'aria-label': 'Line number ' + p.code.split('').join(' ') }, fmtCode(p.code)),
      bar, timer,
      h('p', { class: 'timer' }, `${p.calls} ${p.calls === 1 ? 'call' : 'calls'} so far`),
      h('div', { class: 'row' },
        live ? h('a', { class: 'btn small primary', href: `/c/${p.code}`, target: '_blank', rel: 'noopener' }, 'Test call') : null,
        live ? h('button', { class: 'btn small', onclick: () => copy(link, 'Link copied') }, 'Copy link') : null,
        live ? h('button', { class: 'btn small', onclick: () => copy(fmtCode(p.code), 'Number copied') }, 'Copy number') : null,
        live ? h('button', { class: 'btn small danger', onclick: async () => { if (confirm(`End "${p.name}" now? Callers will hear that the service is no longer available.`)) { await api('DELETE', `/api/projects/${p.id}`); toast('Line ended'); load(); } } }, 'End now') : null));
  }
  load().catch((e) => toast(e.message));
  return wrap;
}

// ---------- builder ----------
function builder() {
  const L = state.catalog.languages;
  const f = { name: '', language: 'en-IN', voice: 'female', intro: '',
    o1: { prompt: '', type: 'say', text: '', url: '' }, o2: { prompt: '', type: 'say', text: '', url: '' } };
  const err = h('div', { class: 'err', hidden: true, role: 'alert' });
  const preview = h('div', {});

  const text = (key, label, ph, opts = {}) => {
    const el = h(opts.area ? 'textarea' : 'input', { type: opts.area ? null : 'text', placeholder: ph, maxlength: opts.max, required: true });
    el.addEventListener('input', () => { f[key] = el.value; draw(); });
    return h('label', { class: 'field' }, h('span', {}, label), el, opts.hint ? h('small', {}, opts.hint) : null);
  };
  const option = (n) => {
    const o = f['o' + n];
    const url = h('input', { type: 'url', placeholder: 'https://example.com/register', maxlength: 300 });
    const urlField = h('label', { class: 'field', hidden: true }, h('span', {}, 'Link to show on screen (optional)'), url);
    const prompt = h('input', { type: 'text', maxlength: 200, required: true, placeholder: n === 1 ? 'Press 1 to know the event timings.' : 'Press 2 to know how to register.' });
    const type = h('select', {}, h('option', { value: 'say' }, 'The agent tells the caller something'), h('option', { value: 'link' }, 'The agent tells them and shows a link'));
    const body = h('textarea', { maxlength: 600, required: true, placeholder: n === 1 ? 'The exhibition runs from 9 AM to 4 PM this Saturday.' : 'Registration is free. Open the link on your screen to sign up.' });
    prompt.addEventListener('input', () => { o.prompt = prompt.value; draw(); });
    body.addEventListener('input', () => { o.text = body.value; draw(); });
    url.addEventListener('input', () => { o.url = url.value; draw(); });
    type.addEventListener('change', () => { o.type = type.value; urlField.hidden = o.type !== 'link'; draw(); });
    return h('fieldset', {}, h('legend', {}, `Option ${n}`),
      h('label', { class: 'field' }, h('span', {}, 'What the agent says to offer it'), prompt),
      h('label', { class: 'field' }, h('span', {}, 'What happens when the caller chooses it'), type),
      h('label', { class: 'field' }, h('span', {}, 'What the agent says in response'), body),
      urlField);
  };

  const lang = h('select', {}, L.map((l) => h('option', { value: l.code }, l.label)));
  lang.addEventListener('change', () => { f.language = lang.value; draw(); });
  const voice = h('select', {}, h('option', { value: 'female' }, 'Female voice'), h('option', { value: 'male' }, 'Male voice'));
  voice.addEventListener('change', () => { f.voice = voice.value; });

  const say = (t, ph) => h('div', { class: 'say' + (t ? '' : ' empty-line') }, t || ph);
  function draw() {
    preview.replaceChildren(...[
      say(f.intro, 'Your introduction…'), say(f.o1.prompt, 'Option 1 prompt…'), say(f.o2.prompt, 'Option 2 prompt…'),
      h('p', { class: 'press' }, 'CALLER PRESSES 1'), say(f.o1.text, 'Response to option 1…'),
      f.o1.type === 'link' ? h('div', { class: 'card-mock' }, f.o1.url || 'A link appears here if you add one') : null,
      h('p', { class: 'press' }, 'CALLER PRESSES 2'), say(f.o2.text, 'Response to option 2…'),
      f.o2.type === 'link' ? h('div', { class: 'card-mock' }, f.o2.url || 'A link appears here if you add one') : null,
    ].filter(Boolean));
  }

  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Create line');
  const form = h('form', { class: 'panel', onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; submit.disabled = true;
    try {
      await api('POST', '/api/projects', { name: f.name, language: f.language, voice: f.voice, intro: f.intro,
        option1: f.o1, option2: f.o2 });
      toast('Your line is live for 24 hours'); location.hash = '#/lines';
    } catch (ex) { err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ block: 'center' }); }
    finally { submit.disabled = false; }
  } },
    err,
    text('name', 'Project name', 'School Event', { max: 60 }),
    h('div', { class: 'two' }, h('label', { class: 'field' }, h('span', {}, 'Language'), lang), h('label', { class: 'field' }, h('span', {}, 'Voice'), voice)),
    text('intro', 'Introduction', 'Hello, welcome to our school science exhibition.', { area: true, max: 400, hint: 'This is the first thing callers hear.' }),
    option(1), option(2),
    h('div', { class: 'row' }, submit, h('a', { class: 'btn quiet', href: '#/lines' }, 'Cancel')));

  draw();
  return h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, 'New line'), h('p', {}, 'It goes live as soon as you create it and expires 24 hours later.'))),
    h('div', { class: 'builder' }, form,
      h('aside', { class: 'panel preview', 'aria-label': 'Preview' }, h('h3', {}, 'What callers hear'), h('p', { class: 'sub' }, 'A live preview of your call.'), preview)));
}

boot().catch((e) => { view.replaceChildren(h('p', { class: 'err' }, 'Could not load Dayline: ' + e.message)); });
