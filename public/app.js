const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const elCouncil = $('#council');
const elEmpty   = $('#empty');
const elHistory = $('#history');
const elHistoryList = $('#history-list');
const elPulse   = $('#pulse-feed');
const elStatus  = $('#status');
const elInput   = $('#input');
const elForm    = $('#form');
const elTplSig  = $('#tpl-signal');

const cards = new Map(); // signal_id → card element

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function setRunning(on) {
  elStatus.textContent = on ? 'live' : 'idle';
  elStatus.className = `pill ${on ? 'pill-on' : 'pill-off'}`;
}

function buildCard(signal, { historical = false } = {}) {
  const node = elTplSig.content.firstElementChild.cloneNode(true);
  node.dataset.id = signal.id;
  $('.signal-text', node).textContent = signal.text;
  $('.signal-time', node).textContent = fmtTime(signal.ts);
  if (historical) {
    elHistoryList.prepend(node);
  } else {
    if (elEmpty && !elEmpty.classList.contains('hidden')) elEmpty.classList.add('hidden');
    elCouncil.prepend(node);
  }
  cards.set(signal.id, node);
  return node;
}

function moveActiveToHistory(signalId) {
  const node = cards.get(signalId);
  if (!node) return;
  if (node.parentElement === elCouncil) {
    elHistoryList.prepend(node);
    elHistory.classList.remove('hidden');
  }
}

function applyPerspective(p) {
  const card = cards.get(p.signal_id);
  if (!card) return;
  const lens = $(`.lens[data-agent="${p.agent}"]`, card);
  if (!lens) return;
  lens.classList.remove('thinking');
  if (p.kind === 'ACT') {
    lens.classList.add(`engaged-${p.agent}`);
    $('.lens-body', lens).textContent = p.text;
    $('.lens-state', lens).textContent = 'engaged';
  } else if (p.kind === 'PASS') {
    lens.classList.add('passed');
    $('.lens-body', lens).textContent = p.text;
    $('.lens-state', lens).textContent = 'passed';
  }
}

function applyThinking(signalId, agent) {
  const card = cards.get(signalId);
  if (!card) return;
  const lens = $(`.lens[data-agent="${agent}"]`, card);
  if (!lens) return;
  lens.classList.add('thinking');
  $('.lens-state', lens).textContent = 'thinking';
}

function applyInsight(i) {
  const card = cards.get(i.signal_id);
  if (!card) return;
  const syn = $('.synthesis', card);
  if (!syn) return;
  $('.syn-insight', syn).textContent = i.insight;
  $('.syn-action',  syn).textContent = i.action;
  syn.classList.remove('hidden');
}

function pulseLine({ agent, kind, text, ts }) {
  if (kind === 'ERROR') return;
  const div = document.createElement('div');
  div.className = 'pulse-line';
  const a = document.createElement('span');
  a.className = `pulse-agent pulse-agent-${agent}`;
  a.textContent = agent;
  const k = document.createElement('span');
  k.className = 'pulse-kind';
  k.textContent = `· ${kind.toLowerCase()} ·`;
  const t = document.createElement('span');
  t.className = 'pulse-text';
  t.textContent = text;
  div.append(a, k, t);
  elPulse.prepend(div);
  while (elPulse.children.length > 80) elPulse.removeChild(elPulse.lastChild);
}

// ---- snapshot rehydration ----
function setKeyBanner(hasKey) {
  const b = document.getElementById('key-banner');
  if (!b) return;
  b.classList.toggle('hidden', !!hasKey);
}

function setObservatoryLink(spacebase) {
  const a = document.getElementById('observatory-link');
  if (!a) return;
  if (spacebase && spacebase.observatory_url) {
    a.href = spacebase.observatory_url;
    a.classList.remove('hidden');
  } else {
    a.classList.add('hidden');
  }
}

function rehydrate(s) {
  setRunning(s.running);
  if ('has_key' in s) setKeyBanner(s.has_key);
  if ('spacebase' in s) setObservatoryLink(s.spacebase);
  // current = newest signal; rest become history
  if (s.signals.length) {
    const [current, ...prior] = s.signals;
    if (current) buildCard(current);
    for (const sig of prior) buildCard(sig, { historical: true });
    if (prior.length) elHistory.classList.remove('hidden');
  }
  for (const p of [...s.perspectives].reverse()) applyPerspective(p);
  for (const i of [...s.insights].reverse()) applyInsight(i);
  for (const f of [...s.feed].reverse()) pulseLine(f);
}

// ---- SSE ----
function connect() {
  const es = new EventSource('/stream');
  es.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }

    if (m.type === 'snapshot') return rehydrate(m.state);
    if (m.type === 'running')  return setRunning(m.running);

    if (m.type === 'signal') {
      // when a NEW signal arrives, the previous one moves to history
      const prev = elCouncil.querySelector('.signal-card');
      if (prev) {
        const id = prev.dataset.id;
        moveActiveToHistory(id);
      }
      buildCard(m.signal);
      return;
    }

    if (m.type === 'feed') {
      pulseLine(m);
      // derived UI updates from feed events
      if (m.kind === 'THINKING' && m.signal_id) {
        applyThinking(m.signal_id, m.agent);
      }
      if ((m.kind === 'ACT' || m.kind === 'PASS') && m.signal_id) {
        applyPerspective({ signal_id: m.signal_id, agent: m.agent, kind: m.kind, text: m.text });
      }
      if (m.kind === 'CONVERGE' && m.signal_id) {
        const [insight, action] = m.text.split(' → ');
        applyInsight({ signal_id: m.signal_id, insight: insight || '', action: action || '' });
        if (window.__resolveSynthesis) window.__resolveSynthesis(m.signal_id);
        if (typeof speak === 'function' && insight && action) {
          speak(`Insight. ${insight}. Action. ${action}.`);
        }
      }
      return;
    }

    if (m.type === 'reset') {
      cards.clear();
      elCouncil.innerHTML = '';
      elCouncil.appendChild(elEmpty);
      elEmpty.classList.remove('hidden');
      elHistoryList.innerHTML = '';
      elHistory.classList.add('hidden');
      elPulse.innerHTML = '';
      return;
    }
  };
  es.onerror = () => {
    setRunning(false);
    setTimeout(connect, 2000);
  };
}

// ---- send signal ----
async function sendSignal(text) {
  if (!text || !text.trim()) return;
  elInput.value = '';
  await fetch('/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

elForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendSignal(elInput.value);
});

$$('.chip').forEach((b) => b.addEventListener('click', () => sendSignal(b.dataset.text)));

$('#reset').addEventListener('click', async () => {
  await fetch('/reset', { method: 'POST' });
});

// ---- AUTO-DEMO: one button, curated sequence, hands-free ----
const DEMO_SEQUENCE = [
  'OpenAI ships agents that can issue purchase orders without human approval',
  'EU passes law requiring AI agents to register before acting on user behalf',
  'A solo founder shipped a coding agent that hit $50k MRR in 30 days',
  'Anthropic warns agent-to-agent commerce will outpace KYC by 2027',
];

let demoRunning = false;
const synthesisWaiters = new Map();

window.__resolveSynthesis = (signalId) => {
  const r = synthesisWaiters.get(signalId);
  if (r) { r(); synthesisWaiters.delete(signalId); }
};

function waitForSynthesis(signalId, timeoutMs = 14000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { synthesisWaiters.delete(signalId); resolve(); }, timeoutMs);
    synthesisWaiters.set(signalId, () => { clearTimeout(t); resolve(); });
  });
}

async function runDemo() {
  if (demoRunning) return;
  demoRunning = true;
  const btn = $('#run-demo');
  btn.classList.add('running');
  btn.disabled = true;
  $('.run-demo-label', btn).textContent = 'Demo running…';
  $('.run-demo-sub', btn).textContent = '0 / ' + DEMO_SEQUENCE.length;

  await fetch('/reset', { method: 'POST' });
  await new Promise((r) => setTimeout(r, 600));

  for (let i = 0; i < DEMO_SEQUENCE.length; i++) {
    $('.run-demo-sub', btn).textContent = `${i + 1} / ${DEMO_SEQUENCE.length}`;
    const res = await fetch('/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: DEMO_SEQUENCE[i] }),
    }).then((r) => r.json()).catch(() => null);
    const sigId = res?.signal?.id;
    if (sigId) await waitForSynthesis(sigId);
    await new Promise((r) => setTimeout(r, 2200)); // let judges read
  }

  btn.classList.remove('running');
  btn.disabled = false;
  $('.run-demo-label', btn).textContent = '▸ Run again';
  $('.run-demo-sub', btn).textContent = `${DEMO_SEQUENCE.length} signals shipped`;
  demoRunning = false;
}

$('#run-demo').addEventListener('click', runDemo);

// ---- VOICE: speak an intent, optionally hear the synthesis ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#mic');
let rec = null;
let listening = false;

if (SR) {
  rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;

  rec.onresult = (e) => {
    let t = '';
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
    elInput.value = t.trim();
  };
  rec.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
    const t = elInput.value.trim();
    if (t.length >= 6) sendSignal(t);
  };
  rec.onerror = () => {
    listening = false;
    micBtn.classList.remove('listening');
  };

  micBtn.addEventListener('click', () => {
    if (listening) { try { rec.stop(); } catch {} return; }
    elInput.value = '';
    listening = true;
    micBtn.classList.add('listening');
    try { rec.start(); } catch { listening = false; micBtn.classList.remove('listening'); }
  });
} else {
  micBtn.title = 'voice not supported in this browser — Chrome or Edge required';
  micBtn.style.opacity = '0.5';
  micBtn.addEventListener('click', () => alert('Voice input requires Chrome or Edge.'));
}

// Speak insight + action when synthesis lands, if toggle is on
const speakToggle = $('#speak-out');
async function speak(text) {
  if (!speakToggle?.checked) return;
  // Try ElevenLabs (JARVIS voice) first.
  try {
    const r = await fetch(`/tts?text=${encodeURIComponent(text)}`);
    if (r.ok && r.headers.get('content-type')?.includes('audio')) {
      const buf = await r.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.play().catch(() => {});
      a.onended = () => URL.revokeObjectURL(url);
      return;
    }
  } catch {}
  // Fallback: browser TTS
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const pref = voices.find((v) => /Samantha|Google US English|Microsoft Aria|Microsoft Jenny/i.test(v.name)) || voices[0];
  if (pref) u.voice = pref;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
// preload voices (Chrome lazy-loads them)
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// initial /state for has_key + spacebase (SSE snapshot won't include them)
fetch('/state').then(r => r.json()).then((s) => {
  setKeyBanner(s.has_key);
  setObservatoryLink(s.spacebase);
});

// ---- live judges scoreboard ----
async function refreshScoreboard() {
  try {
    const r = await fetch('/spacebase-stats');
    const d = await r.json();
    const depth = $('#sb-depth');
    const native = $('#sb-native');
    if (d && d.ok) {
      const cell_n = document.querySelector('.sb-cell[data-key="native"]');
      const cell_d = document.querySelector('.sb-cell[data-key="depth"]');
      const cell_o = document.querySelector('.sb-cell[data-key="originality"]');
      const cell_dm = document.querySelector('.sb-cell[data-key="demo"]');
      cell_n?.classList.add('live');
      cell_d?.classList.add('live');
      cell_o?.classList.add('live');
      cell_dm?.classList.add('live');
      native.textContent = `${d.signals} signals · ${d.perspectives_engaged} engaged · ${d.syntheses} converged`;
      depth.textContent = `home: ${(d.home_space_id||'').slice(0, 24)}…`;
    } else {
      native.textContent = 'spacebase1 offline';
      native.classList.add('empty');
    }
  } catch {
    const n = $('#sb-native');
    n.textContent = 'stats endpoint unreachable';
    n.classList.add('empty');
  }
}
refreshScoreboard();
setInterval(refreshScoreboard, 5000);

// ---- JARVIS notification line: brief audio popup when synthesis converges ----
const _origApplyInsight = applyInsight;
applyInsight = function(i) {
  _origApplyInsight(i);
  // refresh scoreboard sooner after a convergence
  setTimeout(refreshScoreboard, 800);
};

connect();
