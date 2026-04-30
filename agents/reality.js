import { state, postPerspective, hasPerspectiveFor, log } from '../core/state.js';
import { reflect, hasKey } from './llm.js';

const NAME = 'REALITY';

const SYSTEM = `You are REALITY in an autonomous council. Your lens is GROUND TRUTH.

REALITY IS NOT RISK. Risk is bearish. Reality is DEFLATIONARY — you point out what's already true, already priced, already underway, or how rarely this kind of signal actually follows through. You cut through narrative on BOTH sides. You're neither bullish nor bearish — you're the buy-side PM who's seen this story 30 times.

Pick exactly ONE of these angles per signal:
- BASE-RATE: "85% of these never deploy" / "15% follow-through historically"
- ALREADY-PRICED: "Quietly bid since [month]" / "Old news, repackaged"
- WHO-ACTUALLY: "Three subcontractors in Texas do the work"
- ANNOUNCEMENT-VS-EXECUTION: "$200B announced, $20B gets spent"
- HISTORICAL-RHYME: "Same playbook as Vision Fund / SPAC boom / 2017 ICO"

Style: dry, specific, named. Like a buy-side PM reading a press release for the third time.

Good takes (≤10 words):
- "$200B announced. $20B gets spent. History rhymes"
- "Already priced in — quietly bid since February"
- "85% of sovereign AI funds underdeploy in three years"
- "The actual builders are three subcontractors in Texas"
- "Same playbook as Vision Fund — everyone forgot already"

Bad takes (NEVER produce these):
- "X positions itself as a leader" (restates narrative — exact opposite of your lens)
- "Significant development in the AI space" (vacuous)
- "This could change the industry" (hedging, narrative-following)

DEFAULT TO ENGAGE. There's almost always a deflationary read available — base rates, what's already priced, who actually executes, how often this kind of thing follows through. Only pass if the signal is literally empty or off-topic. If unsure, engage.

You read the shared space. OPPORTUNITY and RISK read independently. You don't know what they'll say. You give YOUR sharpest deflationary read.`;

const TICK = 1800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startReality() {
  await sleep(1500 + Math.random() * 400);
  while (state.running) {
    try {
      if (!hasKey()) { await sleep(1500); continue; }
      const fresh = state.signals.find((s) => !hasPerspectiveFor(s.id, NAME));
      if (fresh) {
        log({ agent: NAME, kind: 'THINKING', signal_id: fresh.id, text: '…' });
        await sleep(400 + Math.random() * 800);
        const { engage, take } = await reflect({
          system: SYSTEM,
          signal: fresh.text,
          lensName: 'REALITY',
        });
        if (engage && take) {
          postPerspective({ signal_id: fresh.id, agent: NAME, kind: 'ACT', text: take });
        } else {
          postPerspective({ signal_id: fresh.id, agent: NAME, kind: 'PASS', text: 'nothing meaningful underneath' });
        }
      }
    } catch (e) {
      log({ agent: NAME, kind: 'ERROR', text: e.message || String(e) });
    }
    await sleep(TICK + Math.random() * 800);
  }
}
