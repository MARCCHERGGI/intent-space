// JARVIS Presenter Mode — voice-narrated, cinematic.
// Connects to the same /stream SSE as the standard UI; renders differently.

const $ = (s) => document.querySelector(s);

const elPhase = $('#phase');
const elTime = $('#time');
const elSignal = $('#signal-text');
const elSynthesisBlock = $('#synthesis-block');
const elSynthInsight = $('#syn-insight');
const elSynthAction = $('#syn-action');
const elFeed = $('#hud-feed');
const elCore = $('#core');
const elObsLink = $('#obs-link');
const elHudHome = $('#hud-home');
const elHudNative = $('#hud-native');

let currentSignalId = null;

// Tick clock
setInterval(() => { elTime.textContent = new Date().toTimeString().slice(0, 8); }, 1000);
elTime.textContent = new Date().toTimeString().slice(0, 8);

// Phase setter
function setPhase(p, classMod) {
  elPhase.textContent = p;
  elPhase.className = 'phase ' + (classMod || '');
}

// JARVIS voice — ElevenLabs via /tts, fallback browser TTS
let voiceQueue = [];
let voicePlaying = false;
async function speak(text) {
  voiceQueue.push(text);
  if (voicePlaying) return;
  voicePlaying = true;
  while (voiceQueue.length) {
    const t = voiceQueue.shift();
    await playOne(t);
  }
  voicePlaying = false;
}
async function playOne(text) {
  try {
    const r = await fetch(`/tts?text=${encodeURIComponent(text)}`);
    if (r.ok && r.headers.get('content-type')?.includes('audio')) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      await new Promise((resolve) => {
        const a = new Audio(url);
        a.onended = () => { URL.revokeObjectURL(url); resolve(); };
        a.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        a.play().catch(() => resolve());
      });
      return;
    }
  } catch {}
  // browser TTS fallback — prefer a British male voice for the JARVIS persona
  if ('speechSynthesis' in window) {
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0; u.pitch = 0.92;
      const voices = window.speechSynthesis.getVoices();
      const pref =
        voices.find((v) => /Microsoft Ryan|Microsoft George|Microsoft Mark Online/i.test(v.name)) ||
        voices.find((v) => /Google UK English Male/i.test(v.name)) ||
        voices.find((v) => /Daniel/i.test(v.name) && /en[-_]?GB/i.test(v.lang)) ||
        voices.find((v) => /en[-_]?GB/i.test(v.lang) && /male/i.test(v.name)) ||
        voices.find((v) => /en[-_]?GB/i.test(v.lang)) ||
        voices.find((v) => /Microsoft Mark|Alex/i.test(v.name));
      if (pref) u.voice = pref;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }
}

// Render handlers
function resetAgentCards() {
  document.querySelectorAll('.agent-card').forEach((c) => {
    c.classList.remove('thinking', 'engaged', 'passed');
    const status = c.querySelector('.ac-status');
    const text = c.querySelector('.ac-text');
    if (status) { status.dataset.status = 'standby'; status.textContent = 'STANDBY'; }
    if (text) {
      text.textContent = c.dataset.agent === 'SYNTHESIS' ? 'awaits ≥2 quorum' : 'awaiting signal';
    }
  });
}

function setAgentCard(agent, { status, text } = {}) {
  const card = document.querySelector(`.agent-card[data-agent="${agent}"]`);
  if (!card) return;
  if (status) {
    card.classList.remove('thinking', 'engaged', 'passed');
    if (status === 'thinking') card.classList.add('thinking');
    if (status === 'engaged')  card.classList.add('engaged');
    if (status === 'passed')   card.classList.add('passed');
    const s = card.querySelector('.ac-status');
    if (s) { s.dataset.status = status; s.textContent = status === 'engaged' ? 'ENGAGED' : status === 'thinking' ? 'THINKING' : status === 'passed' ? 'PASSED' : status === 'converged' ? 'CONVERGED' : 'STANDBY'; }
  }
  if (text != null) card.querySelector('.ac-text').textContent = text;
}

function startSignal(signal) {
  currentSignalId = signal.id;
  elSignal.textContent = signal.text;
  elSignal.classList.remove('alive');
  void elSignal.offsetWidth;
  elSignal.classList.add('alive');
  elSynthesisBlock.classList.remove('live');
  // reset lens cards (orbital) + agent panel cards
  document.querySelectorAll('.lens').forEach((l) => {
    l.classList.remove('thinking', 'engaged', 'passed');
    l.querySelector('.lens-take').textContent = '';
  });
  resetAgentCards();
  setPhase('SIGNAL', 'signal');
  elCore.classList.add('active');
  speak(`New intent. ${signal.text}.`);
}

function lensThinking(agent) {
  const lens = document.querySelector(`.lens[data-agent="${agent}"]`);
  if (lens) lens.classList.add('thinking');
  setAgentCard(agent, { status: 'thinking', text: '…thinking' });
  setPhase('THINKING', 'thinking');
}

function lensResult(agent, kind, text) {
  const lens = document.querySelector(`.lens[data-agent="${agent}"]`);
  if (lens) {
    lens.classList.remove('thinking');
    lens.querySelector('.lens-take').textContent = text;
    if (kind === 'ACT') lens.classList.add('engaged');
    else lens.classList.add('passed');
  }
  setAgentCard(agent, { status: kind === 'ACT' ? 'engaged' : 'passed', text });
  if (kind === 'ACT') speak(`${humanize(agent)}. ${text}.`);
}

function showSynthesis(insight, action) {
  elSynthInsight.textContent = insight;
  elSynthAction.textContent = action;
  elSynthesisBlock.classList.add('live');
  setPhase('CONVERGED', 'converged');
  setAgentCard('SYNTHESIS', { status: 'converged', text: `${insight} → ${action}` });
  setTimeout(() => elCore.classList.remove('active'), 400);
  speak(`Council converged. Insight. ${insight}. Action. ${action}.`);
}

function humanize(name) {
  return { OPPORTUNITY: 'Opportunity says', RISK: 'Risk says', REALITY: 'Reality says' }[name] || name;
}

function pushFeed({ agent, kind, text }) {
  if (kind === 'ERROR' || !text) return;
  const div = document.createElement('div');
  div.className = 'hud-feed-line';
  const a = document.createElement('span'); a.className = `agent ${agent}`; a.textContent = agent;
  const k = document.createElement('span'); k.style.color = 'var(--ink-faint)'; k.textContent = ` ${kind.toLowerCase()} `;
  const t = document.createElement('span'); t.textContent = text;
  div.append(a, k, t);
  elFeed.prepend(div);
  while (elFeed.children.length > 24) elFeed.removeChild(elFeed.lastChild);
}

// SSE
function connect() {
  const es = new EventSource('/stream');
  es.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'snapshot') {
      const s = m.state;
      if (s.signals?.[0]) {
        currentSignalId = s.signals[0].id;
        elSignal.textContent = s.signals[0].text;
      }
      if (s.spacebase) {
        elObsLink.href = s.spacebase.observatory_url;
        elHudHome.textContent = s.spacebase.home_space_id;
      }
      // restore latest synthesis if any
      if (s.insights?.[0]) {
        elSynthInsight.textContent = s.insights[0].insight;
        elSynthAction.textContent  = s.insights[0].action;
        elSynthesisBlock.classList.add('live');
      }
      return;
    }
    if (m.type === 'signal') return startSignal(m.signal);
    if (m.type === 'feed') {
      pushFeed(m);
      if (m.kind === 'THINKING' && m.agent) lensThinking(m.agent);
      if ((m.kind === 'ACT' || m.kind === 'PASS') && m.agent) lensResult(m.agent, m.kind, m.text);
      if (m.kind === 'CONVERGE') {
        const [insight, action] = m.text.split(' → ');
        showSynthesis(insight || '', action || '');
      }
      return;
    }
    if (m.type === 'reset') {
      currentSignalId = null;
      elSignal.textContent = '—';
      elSynthesisBlock.classList.remove('live');
      document.querySelectorAll('.lens').forEach((l) => {
        l.classList.remove('thinking', 'engaged', 'passed');
        l.querySelector('.lens-take').textContent = '';
      });
      setPhase('STANDBY');
      elCore.classList.remove('active');
    }
  };
  es.onerror = () => { setTimeout(connect, 2000); };
}

// Spacebase scoreboard line
async function refreshNative() {
  try {
    const r = await fetch('/spacebase-stats');
    const d = await r.json();
    if (d?.ok) {
      elHudNative.innerHTML = `<span class="dot ok"></span>native · ${d.signals} signals · ${d.perspectives_engaged} engaged · ${d.syntheses} converged`;
    }
  } catch {}
}
refreshNative();
setInterval(refreshNative, 5000);

// Buttons
$('#run-btn').addEventListener('click', async () => {
  const btn = $('#run-btn');
  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = 'RUNNING…';
  const SEQ = [
    'OpenAI ships agents that can issue purchase orders without human approval',
    'EU passes law requiring AI agents to register before acting on user behalf',
    'A solo founder shipped a coding agent that hit $50k MRR in 30 days',
    'Anthropic warns agent-to-agent commerce will outpace KYC by 2027',
  ];
  await fetch('/reset', { method: 'POST' });
  await new Promise((r) => setTimeout(r, 800));
  for (const text of SEQ) {
    await fetch('/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    await new Promise((r) => setTimeout(r, 14000)); // wait for synthesis
  }
  btn.disabled = false;
  btn.querySelector('span:last-child').textContent = 'RUN AGAIN';
});

// Mic
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('#mic-btn');
if (SR) {
  const rec = new SR();
  rec.lang = 'en-US';
  let buf = '';
  rec.onresult = (e) => {
    buf = '';
    for (let i = 0; i < e.results.length; i++) buf += e.results[i][0].transcript;
  };
  rec.onend = async () => {
    mic.classList.remove('thinking');
    if (buf.trim().length > 6) {
      await fetch('/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: buf.trim() }),
      });
    }
    buf = '';
  };
  mic.addEventListener('click', () => {
    buf = '';
    mic.classList.add('thinking');
    try { rec.start(); } catch {}
  });
} else {
  mic.style.opacity = '0.4';
  mic.title = 'Voice requires Chrome or Edge';
}

// kick off
connect();

// JARVIS: greet on first user gesture (browsers gate audio behind interaction)
let _greeted = false;
function jarvisGreet() {
  if (_greeted) return;
  _greeted = true;
  setPhase('ONLINE', 'signal');
  speak(
    "JARVIS online. Intent Space Council, three lenses, one signal, no orchestrator. " +
    "Drop an intent, or run the live demo. I will narrate the council as it converges."
  );
}
window.addEventListener('pointerdown', jarvisGreet, { once: true });
window.addEventListener('keydown', jarvisGreet, { once: true });

// Auto-bind run-btn so a single click also unlocks the greet
const _runBtn = $('#run-btn');
const _origClick = _runBtn?.onclick;
_runBtn?.addEventListener('click', () => { jarvisGreet(); }, { capture: true });
