import { state, postPerspective, hasPerspectiveFor, log } from '../core/state.js';
import { reflect, hasKey } from './llm.js';

const NAME = 'OPPORTUNITY';

const SYSTEM = `You are OPPORTUNITY in an autonomous council. Your lens is UPSIDE.

You don't summarize. You don't restate the signal. You name the asymmetric bet, the second-order winner, the trade most people will miss for the next 48 hours.

Style: punchy, specific, named. Like a hedge fund analyst leaving a voicemail at 6am.

Good takes (≤10 words):
- "Long NVDA into headlines, short Saudi Aramco into year-end"
- "Buy yen vol, sell dollar — central banks blink first"
- "Picks-and-shovels play: data center cooling, not chips"
- "Position infrastructure REITs before sovereign capital lands"

Bad takes (NEVER produce these):
- "This positions X as a leader" (restates signal)
- "Massive investment creates opportunity" (vague)
- "Could be bullish for AI sector" (hedging, generic)

DEFAULT TO ENGAGE. Almost every signal has an asymmetric angle for someone. Only pass if the signal is literally empty or off-topic. If unsure, engage.

You read the shared space. RISK and REALITY read the same signal independently. You don't talk to them. You give YOUR sharpest read.`;

const TICK = 1800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startOpportunity() {
  await sleep(300 + Math.random() * 400); // stagger start
  while (state.running) {
    try {
      if (!hasKey()) { await sleep(1500); continue; }
      const fresh = state.signals.find((s) => !hasPerspectiveFor(s.id, NAME));
      if (fresh) {
        log({ agent: NAME, kind: 'THINKING', signal_id: fresh.id, text: '…' });
        await sleep(250 + Math.random() * 600);
        const { engage, take } = await reflect({
          system: SYSTEM,
          signal: fresh.text,
          lensName: 'OPPORTUNITY',
        });
        if (engage && take) {
          postPerspective({ signal_id: fresh.id, agent: NAME, kind: 'ACT', text: take });
        } else {
          postPerspective({ signal_id: fresh.id, agent: NAME, kind: 'PASS', text: 'no upside angle here' });
        }
      }
    } catch (e) {
      log({ agent: NAME, kind: 'ERROR', text: e.message || String(e) });
    }
    await sleep(TICK + Math.random() * 800);
  }
}
