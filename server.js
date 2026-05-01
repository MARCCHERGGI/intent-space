import 'dotenv/config';
import express from 'express';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { state, postSignal, reset, snapshot, subscribe, broadcast } from './core/state.js';
import { startOpportunity } from './agents/opportunity.js';
import { startRisk } from './agents/risk.js';
import { startReality } from './agents/reality.js';
import { startSynthesis } from './agents/synthesis.js';
import { hasKey } from './agents/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 7700;

app.get('/state', (_req, res) => res.json({ has_key: hasKey(), ...snapshot() }));

// JARVIS presenter mode
app.get('/present', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'present.html')));

// SSE — every log() / perspective / insight is pushed here in real time.
app.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'snapshot', state: snapshot() })}\n\n`);
  subscribe(res);
  const keepalive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
  req.on('close', () => clearInterval(keepalive));
});

function bootAgents() {
  startOpportunity();
  startRisk();
  startReality();
  startSynthesis();
}

app.post('/start', (_req, res) => {
  if (state.running) return res.json({ ok: true, msg: 'already running' });
  state.running = true;
  bootAgents();
  broadcast({ type: 'running', running: true });
  res.json({ ok: true });
});

app.post('/stop', (_req, res) => {
  state.running = false;
  broadcast({ type: 'running', running: false });
  res.json({ ok: true });
});

app.post('/reset', (_req, res) => { reset(); res.json({ ok: true }); });

// Live stats from spacebase1 — used by the judges scoreboard panel.
// Cached for 4s so we don't burn CPU shelling out to Python on every poll.
let statsCache = { ts: 0, data: null };
const STATS_SCRIPT = path.resolve(__dirname, 'bridge', 'stats.py');
function fetchStats() {
  return new Promise((resolve) => {
    const PY = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
    const p = spawn(PY, [STATS_SCRIPT], { windowsHide: true, shell: process.platform === 'win32' });
    let out = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} resolve(null); }, 8000);
    p.stdout.on('data', (d) => out += d.toString());
    p.on('error', () => { clearTimeout(t); resolve(null); });
    p.on('close', () => {
      clearTimeout(t);
      try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve(null); }
    });
  });
}
app.get('/spacebase-stats', async (_req, res) => {
  const now = Date.now();
  if (statsCache.data && now - statsCache.ts < 4000) return res.json(statsCache.data);
  const data = await fetchStats();
  if (data) statsCache = { ts: now, data };
  res.json(data || { error: 'unavailable' });
});

// ElevenLabs TTS proxy — JARVIS female voice (Alice, British). Falls through to browser TTS if this fails.
// Tries the latest multilingual_v2 model first, falls back through turbo_v2_5 → flash_v2_5 if quota/blocked.
app.get('/tts', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  const voice = String(req.query.voice || 'Xb7hH8MSUJpSbSDYk0k2'); // Alice — calm, intelligent British female
  const key = process.env.ELEVENLABS_API_KEY;
  if (!text || !key) return res.status(503).json({ error: 'tts unavailable' });
  const MODELS = ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'];
  for (const model_id of MODELS) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id,
          voice_settings: { stability: 0.55, similarity_boost: 0.9, style: 0.25, use_speaker_boost: true },
        }),
      });
      if (r.ok) {
        res.set('Content-Type', 'audio/mpeg');
        res.set('X-Voice-Model', model_id);
        return res.send(Buffer.from(await r.arrayBuffer()));
      }
      if (r.status >= 500 || r.status === 429) continue;
      return res.status(r.status).json({ error: `eleven ${r.status}`, model_id });
    } catch (e) {
      // try next model
    }
  }
  res.status(503).json({ error: 'all eleven models failed — falling back to browser TTS' });
});

app.post('/signal', (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'text required' });
  if (!state.running) {
    state.running = true;
    bootAgents();
    broadcast({ type: 'running', running: true });
  }
  const sig = postSignal(text);
  broadcast({ type: 'signal', signal: sig });
  res.json({ ok: true, signal: sig });
});

app.listen(PORT, () => {
  console.log(`\n  ⊛  Intent Space  →  http://localhost:${PORT}`);
  console.log(`     Drop a signal. Three perspectives emerge. Synthesis converges.\n`);
  if (!hasKey()) {
    console.log(`  ⚠  GROQ_API_KEY missing — copy .env.example to .env and add your key.\n`);
  }
});
