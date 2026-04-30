// THE INTENT SPACE — shared in-memory blackboard.
// Pure data. No orchestrator, no router, no dispatcher anywhere in this codebase.
// Agents read and write here independently, each on its own loop and cursor.
//
// Every event is also fire-and-forget mirrored to spacebase1 commons via core/spacebase.js
// (when bridge/state/spacebase.json exists), so the local demo doubles as a real
// participant in the protocol — fractal nesting and all.

import * as sb from './spacebase.js';
import * as tg from '../services/telegram.js';

export const state = {
  signals: [],       // [{id, text, ts}]                              what the world dropped in
  perspectives: [],  // [{id, signal_id, agent, kind, text, ts}]      ACTed or IGNOREd
  insights: [],      // [{id, signal_id, insight, action, ts}]        emergent convergence
  feed: [],          // [{ts, agent, kind, signal_id, text}]          stream of consciousness
  running: false,
};

let _id = 1;
const newId = (p) => `${p}_${String(_id++).padStart(3, '0')}`;

export function postSignal(text) {
  const sig = { id: newId('sig'), text: String(text).trim(), ts: Date.now() };
  state.signals.unshift(sig);
  if (state.signals.length > 40) state.signals.length = 40;
  log({ agent: 'WORLD', kind: 'SIGNAL', signal_id: sig.id, text: sig.text });
  sb.mirrorSignal(sig.id, sig.text);
  tg.broadcastSignal({ signalText: sig.text });
  return sig;
}

export function postPerspective({ signal_id, agent, kind, text }) {
  const p = { id: newId('per'), signal_id, agent, kind, text, ts: Date.now() };
  state.perspectives.unshift(p);
  if (state.perspectives.length > 200) state.perspectives.length = 200;
  log({ agent, kind, signal_id, text });
  // No mirror here. The protocol-native daemon (bridge/agents_on_protocol.py)
  // owns posting perspectives to spacebase1. Local Node agents only drive the UI.
  return p;
}

export function postInsight({ signal_id, insight, action }) {
  const i = { id: newId('ins'), signal_id, insight, action, ts: Date.now() };
  state.insights.unshift(i);
  if (state.insights.length > 60) state.insights.length = 60;
  log({ agent: 'SYNTHESIS', kind: 'CONVERGE', signal_id, text: `${insight} → ${action}` });
  const sig = state.signals.find((s) => s.id === signal_id);
  const obs = sb.info()?.observatory_url;
  tg.broadcastSynthesis({ signalText: sig?.text || '', insight, action, observatoryUrl: obs });
  return i;
}

// Each agent's "have I seen this signal" check.
// True = perspective already exists for (signal, agent). Independent cursor per agent.
export function hasPerspectiveFor(signal_id, agent) {
  return state.perspectives.some((p) => p.signal_id === signal_id && p.agent === agent);
}

export function actedOn(signal_id) {
  return state.perspectives.filter((p) => p.signal_id === signal_id && p.kind === 'ACT');
}

export function alreadySynthesized(signal_id) {
  return state.insights.some((i) => i.signal_id === signal_id);
}

const subs = new Set();
export function subscribe(res) { subs.add(res); res.on('close', () => subs.delete(res)); }
export function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const sub of subs) { try { sub.write(data); } catch {} }
}

export function log({ agent, kind, signal_id = null, text }) {
  const entry = { ts: Date.now(), agent, kind, signal_id, text };
  state.feed.unshift(entry);
  if (state.feed.length > 300) state.feed.length = 300;
  broadcast({ type: 'feed', ...entry });
}

export function snapshot() {
  return {
    running: state.running,
    has_key: !!process.env.OPENAI_API_KEY,
    spacebase: sb.enabled ? sb.info() : null,
    signals: state.signals.slice(0, 12),
    perspectives: state.perspectives.slice(0, 80),
    insights: state.insights.slice(0, 12),
    feed: state.feed.slice(0, 60),
  };
}

export function reset() {
  state.signals.length = 0;
  state.perspectives.length = 0;
  state.insights.length = 0;
  state.feed.length = 0;
  state.running = false;
  _id = 1;
  broadcast({ type: 'reset' });
}
