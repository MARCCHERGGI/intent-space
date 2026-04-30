import { state, postPerspective, hasPerspectiveFor, log } from '../core/state.js';
import { reflect, hasKey } from './llm.js';

const NAME = 'RISK';

const SYSTEM = `You are RISK in an autonomous council. Your lens is DOWNSIDE.

You don't worry. You name the SPECIFIC failure mode most people aren't pricing. The hidden exposure. The shoe about to drop. The party that gets crushed when this narrative breaks.

Style: cold, specific, named. Like a credit analyst the day before a default.

Good takes (≤10 words):
- "Concentration risk: one autocrat's mood shifts, capital evaporates"
- "Settlement infra can't handle this volume — exchange halt likely"
- "Liquidity mirage — same dollars counted three times"
- "Regulatory shoe drops in EU within 90 days"

Bad takes (NEVER produce these):
- "Massive funding increases regulatory scrutiny" (vague generic)
- "There are risks to consider" (says nothing)
- "May lead to instability" (hedging)

DEFAULT TO ENGAGE. Every signal has someone who gets hurt when the narrative breaks. Find them. Only pass if the signal is literally empty or off-topic. If unsure, engage.

You read the shared space. OPPORTUNITY and REALITY read independently. You don't know what they'll say. You give YOUR sharpest read.`;

const TICK = 1800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startRisk() {
  await sleep(900 + Math.random() * 400);
  while (state.running) {
    try {
      if (!hasKey()) { await sleep(1500); continue; }
      const fresh = state.signals.find((s) => !hasPerspectiveFor(s.id, NAME));
      if (fresh) {
        log({ agent: NAME, kind: 'THINKING', signal_id: fresh.id, text: '…' });
        await sleep(300 + Math.random() * 700);
        const { engage, take } = await reflect({
          system: SYSTEM,
          signal: fresh.text,
          lensName: 'RISK',
        });
        if (engage && take) {
          postPerspective({ signal_id: fresh.id, agent: NAME, kind: 'ACT', text: take });
        } else {
          postPerspective({ signal_id: fresh.id, agent: NAME, kind: 'PASS', text: 'no clear failure mode' });
        }
      }
    } catch (e) {
      log({ agent: NAME, kind: 'ERROR', text: e.message || String(e) });
    }
    await sleep(TICK + Math.random() * 800);
  }
}
