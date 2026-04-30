import 'dotenv/config';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// gpt-4o-mini: ~$0.15/M input, $0.60/M output. Cheap, fast, JSON-mode reliable.
// At ~250 tokens per call x 4 agents per signal = ~$0.0006/signal. $50 budget = ~83k signals.
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export const hasKey = () => !!process.env.OPENAI_API_KEY;

// Cumulative token usage tracker — surfaced in /state for the UI to display.
export const usage = { in: 0, out: 0, calls: 0 };
function track(u) {
  if (!u) return;
  usage.in  += u.prompt_tokens     || 0;
  usage.out += u.completion_tokens || 0;
  usage.calls += 1;
}

// Hard demo constraint — outputs must be ≤ N words.
export function trimWords(s, n = 10) {
  const words = String(s).trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/[.!?,;:]+$/, '')
    .split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(' ');
}

// A perspective agent decides: do I engage with this signal, or pass?
// Returns { engage: bool, take: "<=10 words" }
export async function reflect({ system, signal, lensName }) {
  if (!openai) return { engage: false, take: '' };
  try {
    const r = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: system + `

Return STRICT JSON: {"engage": true|false, "take": "<MAX 10 words>"}

Rules:
- The take must be ASSERTIVE, SPECIFIC, DECLARATIVE — like a sharp Bloomberg headline.
- No hedging words (may, could, might, possibly, perhaps).
- No periods, no quote marks, no preamble.
- If the signal is too vague, off-lens, or already obvious, set engage=false and take="".
- Engage only when YOUR ${lensName} lens has something genuinely useful to add.`,
        },
        { role: 'user', content: `Signal: "${signal}"` },
      ],
      temperature: 0.85,
      max_tokens: 100,
    });
    track(r.usage);
    const parsed = JSON.parse(r.choices[0].message.content);
    return {
      engage: !!parsed.engage,
      take: parsed.take ? trimWords(parsed.take, 10) : '',
    };
  } catch (e) {
    return { engage: false, take: '' };
  }
}

export async function synthesize({ signal, perspectives }) {
  if (!openai) return { insight: '', action: '' };
  const lensSummary = perspectives.map((p) => `[${p.agent}] ${p.text}`).join('\n');
  try {
    const r = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are SYNTHESIS. ${perspectives.length} perspectives landed. Find the TENSION between them.

Process:
1. The lenses are pulling in different directions. Where exactly is the tension? (e.g. "Opportunity sees alpha while Reality says it's already priced")
2. What MEMA-TRUTH resolves or names that tension? — a pattern about how the world actually works.
3. What SPECIFIC move exploits that tension THIS WEEK?

Return STRICT JSON: {"insight": "<MAX 9 words>", "action": "<MAX 9 words, imperative>"}

HARD RULE: The insight must NOT restate, paraphrase, or echo any single lens. It must name something only visible when you hold all of them at once.

HARD RULE: The action must be SPECIFIC — name a ticker, a product, a step, a number, a deadline. Not "invest in," not "monitor."

Good outputs (note: insight names a tension or meta-pattern; action is concrete):
- insight: "Capital arrives 18 months ahead of capability"
  action:  "Long data-center REITs, short pure-play AI ETFs"
- insight: "Regulator always trails capital by two cycles"
  action:  "Open EU compliance audit shop, charge €40k"
- insight: "First mover gets rents, second mover gets the lawsuit"
  action:  "Ship before registration law lands in Q3"
- insight: "Hype priced; execution still in spreadsheets"
  action:  "Wait six weeks, buy the disappointment dip"

Forbidden (NEVER produce — these fail the demo):
- Echoing a single lens verbatim
- "X is reshaping the landscape" (restates)
- "Monitor closely" / "Consider implications" (vapor)
- "Invest in [generic category]" (no specificity)

No hedging, no periods, no preamble.`,
        },
        { role: 'user', content: `Signal: "${signal}"\n\nPerspectives:\n${lensSummary}` },
      ],
      temperature: 0.6,
      max_tokens: 120,
    });
    track(r.usage);
    const parsed = JSON.parse(r.choices[0].message.content);
    return {
      insight: trimWords(parsed.insight || '', 9),
      action:  trimWords(parsed.action  || '', 9),
    };
  } catch (e) {
    return { insight: '', action: '' };
  }
}
