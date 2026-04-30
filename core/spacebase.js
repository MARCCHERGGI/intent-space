// Bridge: mirror every local event into spacebase1 commons via the python SDK.
// Fire-and-forget. The local demo never blocks on this. If the bridge fails,
// the local UI still works — we just lose protocol-side nesting for that run.

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.resolve(__dirname, '..', 'bridge', 'bridge.py');
const STATE_FILE = path.resolve(__dirname, '..', 'bridge', 'state', 'spacebase.json');

import fs from 'fs';
export const enabled = fs.existsSync(STATE_FILE);

// localSignalId → Promise<spacebase_intent_id>
const mirroredSignals = new Map();

function runBridge(args, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!enabled) return resolve(null);
    const p = spawn('python', [BRIDGE, ...args], { windowsHide: true });
    let out = '', err = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} resolve(null); }, timeoutMs);
    p.stdout.on('data', (d) => out += d.toString());
    p.stderr.on('data', (d) => err += d.toString());
    p.on('close', () => {
      clearTimeout(t);
      const line = out.trim().split('\n').pop() || '';
      try {
        const j = JSON.parse(line);
        resolve(j.ok ? j : null);
      } catch { resolve(null); }
    });
  });
}

export function mirrorSignal(localSignalId, text) {
  if (!enabled) return;
  const p = runBridge(['post-signal', text]).then((r) => r?.intentId || null);
  mirroredSignals.set(localSignalId, p);
}

export async function mirrorPerspective(localSignalId, agent, text) {
  if (!enabled) return;
  const sbId = await mirroredSignals.get(localSignalId);
  if (!sbId) return;
  runBridge(['post-perspective', sbId, agent, text]);
}

export async function mirrorSynthesis(localSignalId, insight, action) {
  if (!enabled) return;
  const sbId = await mirroredSignals.get(localSignalId);
  if (!sbId) return;
  runBridge(['post-synthesis', sbId, insight, action]);
}

export async function getSpacebaseId(localSignalId) {
  return await mirroredSignals.get(localSignalId);
}

export function info() {
  if (!enabled) return null;
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}
