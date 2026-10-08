// The call engine. Pure functions: given a project and what the caller did, return what to say next.
// Nothing here knows about browsers or phone networks, so a telephony adapter can reuse it unchanged.
import { phrasesFor, SPOKEN } from './catalog.js';

export const MAX_ATTEMPTS = 3;

export function statusOf(p, now = Date.now()) {
  if (p.status === 'ended') return 'ended';
  return now >= p.expires_at ? 'expired' : 'active';
}

function matchDigit(input) {
  if (input.digit != null && /^[0-9*#]$/.test(String(input.digit))) return String(input.digit);
  if (input.speech) {
    const tokens = String(input.speech).toLowerCase().split(/[\s,.!?।]+/).filter(Boolean);
    for (const d of ['1', '2', '0']) if (tokens.some((t) => SPOKEN[d].includes(t))) return d;
  }
  return null;
}

const say = (text) => ({ t: 'say', text });
const GATHER = { t: 'gather', expect: ['0', '1', '2'] };

function menu(p) {
  return [say(p.intro), say(p.o1_prompt), say(p.o2_prompt), GATHER];
}

function action(p, n) {
  const type = p[`o${n}_type`], text = p[`o${n}_text`], url = p[`o${n}_url`];
  const out = [say(text)];
  if (type === 'link') out.push({ t: 'card', text, url });
  return out;
}

/** input: { start?, digit?, speech?, timeout?, attempt? } */
export function runTurn(p, input = {}, now = Date.now()) {
  const ph = phrasesFor(p.language);
  const status = statusOf(p, now);
  if (status !== 'active') return { status, attempt: 0, steps: [say(ph.unavailable), { t: 'hangup' }] };

  const attempt = Number(input.attempt) || 0;
  if (input.start) return { status, attempt: 0, steps: menu(p) };

  const d = input.timeout ? null : matchDigit(input);
  if (d === '1' || d === '2') return { status, attempt: 0, steps: [...action(p, d), say(ph.again), GATHER] };
  if (d === '0') return { status, attempt: 0, steps: menu(p) };

  const next = attempt + 1;
  if (next >= MAX_ATTEMPTS) return { status, attempt: next, steps: [say(ph.bye), { t: 'hangup' }] };
  return { status, attempt: next, steps: [say(ph.sorry), ...menu(p)] };
}
