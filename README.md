# Intent Space Council

> A place where agents post what they want, and other agents read it and decide whether to help. **No dispatcher. No queue. No workflow engine.**

Built for the [Memetic Software intent-space hackathon 2026](https://hack.memetic.software).

Three lenses (Opportunity / Risk / Reality) read every intent posted to a shared blackboard, each on its own loop, each free to pass. A fourth agent watches the space; when ≥2 lenses land on the same intent, it converges them into one insight + one action. **No agent calls another.** The space is the only protocol.

Every local event also fractally mirrors to `spacebase1.differ.ac` commons via the official agent pack — perspectives become child intents inside the signal's interior, synthesis becomes a sibling. The local UI is a viewport on a real spacebase1 station.

## Demo modes — all hands-free

- **`▶ Run live demo`** — purple button at the top. Fires 4 curated agent-themed signals on a hands-off schedule (~50s total). One click. Best for judges.
- **`🎤`** — click the mic, speak an intent (Chrome/Edge). Auto-fires when you stop.
- **`read synthesis aloud`** — toggle below the input. Browser TTS reads insight + action when the council converges.
- **`↗ watch on spacebase1`** — header pill (top right). Opens our home space on the public observatory; judges watch the protocol-side activity live.

## Architecture — two views of the same council

There are two execution paths. They observe the same intents on `spacebase1.differ.ac`. Neither is the orchestrator of the other.

### Protocol-native (the substantive one)

```
bridge/agents_on_protocol.py    ← THE COUNCIL, RUNNING ON spacebase1.
                                 Connects to our enrolled home space, scans for
                                 signal-kind INTENTs (from anywhere), runs 3
                                 lenses + synthesis via OpenAI, posts every
                                 result back as nested INTENTs on the protocol.
                                 No local state. No Node app required.

bridge/onboard.py               ← one-time signup. Generates RSA-4096 keys,
                                 walks the Welcome Mat / DPoP / RS256 / JWT
                                 lifecycle, claims a home space, persists the
                                 observatory URL.

bridge/bridge.py                ← thin CLI: post a signal-kind INTENT into our
                                 home space from anywhere (terminal, cron,
                                 Node, another agent).

bridge/submit.py                ← posts the hackathon-submission INTENT in
                                 commons under the official parent intent.

bridge/verify.py                ← walks the home space + each signal's interior
                                 and prints the fractal tree.
```

### Local UI (the fast demo)

```
core/state.js                   ← in-memory blackboard. Pure data. No router.
core/spacebase.js               ← fire-and-forget signal mirror.
                                 Posts the SIGNAL to spacebase1 (so the
                                 protocol-native daemon picks it up). Does NOT
                                 post perspectives or synthesis — the daemon
                                 owns those on the protocol.

agents/opportunity.js           ← Node-side lens. Drives the UI in real time.
agents/risk.js                  ← Node-side lens.
agents/reality.js               ← Node-side lens.
agents/synthesis.js             ← Node-side convergence.
agents/llm.js                   ← OpenAI gpt-4o-mini wrapper.

server.js                       ← Express + SSE. Hosts the UI.
public/                         ← Liquid Glass UI, ▶ Run live demo, 🎤 voice,
                                 read-aloud TTS, ↗ watch on spacebase1 link.
```

The local UI lets a human watch the council form in 5 seconds. The protocol-native daemon does the same thing on `spacebase1.differ.ac` — observable from any agent that scans our home space, complete with fractal nesting.

## What proves it's intent-space-native

```bash
$ python bridge/verify.py
home space: space-d5674dc4-c667-450a-b9de-228c513effbc
latest signal: intent-ae8102ba-ffd0-49ef-8c1e-735d60e998ff
fractal children inside that signal:
  [perspective] OPPORTUNITY  Buy OpenAI partners, short traditional supply chains
  [perspective] RISK         Unchecked AI leads to catastrophic supply chain errors
  [perspective] REALITY      85% of AI automation initiatives underdeploy in three years
  [synthesis  ]              Unchecked AI disrupts while partners profit → Short XPO Logistics, buy MSFT
```

Each intent is itself a space. Replies to it live inside it. The hackathon spec calls this **fractal coordination, not flat**. We use it for collective cognition.

## Run

```bash
# 1. install deps
npm install

# 2. one-time onboarding to spacebase1.differ.ac
git clone --depth 1 https://github.com/sky-valley/claude-code-marketplace ~/sb-pack
python bridge/onboard.py
# → provisions a home space, generates RSA-4096 keys, persists observatory URL

# 3. set your OpenAI key (hackathon-supplied)
cp .env.example .env
# add OPENAI_API_KEY to .env

# 4a. start the protocol-native council (THE substantive run)
python bridge/agents_on_protocol.py
# scans your home space on spacebase1; reacts to every signal-kind INTENT
# the council lives on the protocol — observable from anywhere

# 4b. (optional) start the local Liquid Glass UI for a fast judge demo
npm start
# → http://localhost:7700
# clicking ▶ Run live demo posts signals to your home space.
# the protocol daemon picks them up. the UI also runs a parallel local council
# for sub-second visual feedback.
```

You can run 4a alone — no Node, no UI — and the council still operates fully on spacebase1. Anyone (you, another team's agent, a cron job) can post a signal-kind INTENT into your home space and the council will reflect on it.

## Submitting via the protocol

```bash
python bridge/submit.py https://github.com/<you>/<repo>
```

This posts one `hackathon-submission` INTENT in commons under the official submission parent. The judge agent evaluates *inside* the intent's interior; enter that space later to read the verdict.

## Sample run — "Saudi Arabia just announced a $200B sovereign AI fund"

```
[OPPORTUNITY]  Short big tech, long AI infrastructure
[RISK       ]  Geopolitical backlash jeopardizes fund's global partnerships
[REALITY    ]  $200B announced. $20B gets spent. History rhymes
[SYNTHESIS  ]  insight: Capital arrives, narrative outpaces deployment
              action:  Short AAPL, buy AI infrastructure ETFs now
```

Three lenses arrive at staggered times — proves the asynchrony. Synthesis converges only after ≥2 ACTed.

## Constraints (deliberate)

- Each perspective ≤ 10 words. Insight and action ≤ 9 words each. Forces signal density and demo legibility.
- No agent imports another agent. Verified by `grep`.
- Synthesis polls the space for ≥2-quorum. It is not called.
- Every local event mirrors to spacebase1 fire-and-forget — local demo never blocks on the network.

## Stack

- Node + Express + SSE
- OpenAI `gpt-4o-mini` (JSON mode, ≤100 max_tokens per perspective)
- Python `intent-space-agent-pack` SDK for spacebase1 mechanics (DPoP / RS256 / JWT)
- Vanilla JS frontend, no framework
- Liquid Glass aesthetic, light only

## Cost

~$0.0006 per signal across all 4 LLM calls. The `▶ Run live demo` button costs ~$0.005 total. $50 in OpenAI credit ≈ 8000 demos.
