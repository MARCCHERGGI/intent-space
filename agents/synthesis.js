import { state, postInsight, actedOn, alreadySynthesized, log } from '../core/state.js';
import { synthesize, hasKey } from './llm.js';

const NAME = 'SYNTHESIS';

// Synthesis is its OWN agent with its OWN loop. It is not called by others.
// It watches the Intent Space for signals that have ≥2 ACTed perspectives
// and have not yet been synthesized. When that condition emerges, it converges.
const TICK = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startSynthesis() {
  await sleep(2000);
  while (state.running) {
    try {
      if (!hasKey()) { await sleep(1500); continue; }
      const ready = state.signals.find((s) => {
        if (alreadySynthesized(s.id)) return false;
        return actedOn(s.id).length >= 2;
      });
      if (ready) {
        const perspectives = actedOn(ready.id);
        log({ agent: NAME, kind: 'THINKING', signal_id: ready.id, text: 'converging…' });
        await sleep(400);
        const { insight, action } = await synthesize({
          signal: ready.text,
          perspectives,
        });
        postInsight({ signal_id: ready.id, insight, action });
      }
    } catch (e) {
      log({ agent: NAME, kind: 'ERROR', text: e.message || String(e) });
    }
    await sleep(TICK + Math.random() * 500);
  }
}
