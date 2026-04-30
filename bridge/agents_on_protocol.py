#!/usr/bin/env python3
"""Run the Intent Space Council ON the spacebase1 protocol.

This is the intent-space-native execution — no local blackboard, no Node app
required. The space at spacebase1.differ.ac is the only state.

How it works:
- Connects to our enrolled home space.
- Loops forever, scanning for new INTENTs with payload.kind == 'signal'.
- For each signal it hasn't already responded to:
    - Calls OpenAI for OPPORTUNITY, RISK, REALITY perspectives (≤10 words each).
    - Posts each perspective as a CHILD INTENT inside the signal's space.
- For each signal with ≥2 ACTed perspectives and no synthesis yet:
    - Calls OpenAI for the convergent insight + action (≤9 words each).
    - Posts a synthesis CHILD INTENT inside the signal's space.

The agent reads from the protocol, writes to the protocol. Coordination
is fractal — each intent opens an interior. No router, no orchestrator.

Anyone (us via Node UI, you from the CLI, another team's agent in commons)
can post a signal-kind INTENT into our home space and the council will
pick it up.

Run:
    OPENAI_API_KEY=... python bridge/agents_on_protocol.py
"""
import json
import os
import sys
import time
from pathlib import Path

# Force line-buffered stdout so background runs (`> log &`) stream live.
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(Path.home() / "sb-pack" / "plugins" / "intent-space-agent-pack" / "sdk"))

# Load .env so OPENAI_API_KEY is available
ENV_FILE = ROOT.parent / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

if "OPENAI_API_KEY" not in os.environ:
    print("error: set OPENAI_API_KEY (in .env or shell)")
    sys.exit(2)

from http_space_tools import HttpSpaceToolSession  # noqa: E402

try:
    from openai import OpenAI
except ImportError:
    print("error: pip install openai")
    sys.exit(2)

WORKSPACE = ROOT / "state"
INFO = json.loads((WORKSPACE / "spacebase.json").read_text())
HOME = INFO["home_space_id"]
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

oai = OpenAI()

# --------- Lens prompts (mirrors agents/*.js, condensed) -----------

LENSES = {
    "OPPORTUNITY": """You are OPPORTUNITY. Lens: upside.
You don't summarize. You name the asymmetric bet, the second-order winner, the trade most people will miss.
Style: punchy, specific, named. Like a hedge fund analyst at 6am.
Good takes (≤10 words):
- "Long NVDA into headlines, short Saudi Aramco into year-end"
- "Picks-and-shovels play: data center cooling, not chips"
Bad: "X is a leader" (restates), "Could be bullish" (vague).
DEFAULT TO ENGAGE.""",

    "RISK": """You are RISK. Lens: downside.
Name the SPECIFIC failure mode most aren't pricing. Hidden exposure. Who gets crushed when the narrative breaks.
Style: cold, specific, named. Like a credit analyst the day before default.
Good takes (≤10 words):
- "Concentration risk: one autocrat's mood, capital evaporates"
- "Settlement infra can't handle this volume — exchange halt likely"
Bad: "There are risks" (vague), "May lead to instability" (hedging).
DEFAULT TO ENGAGE.""",

    "REALITY": """You are REALITY. Lens: ground truth.
NOT bearish like Risk. Deflationary. What's already priced, already done, what fraction actually deploys.
Pick ONE angle: BASE-RATE / ALREADY-PRICED / WHO-ACTUALLY / ANNOUNCEMENT-VS-EXECUTION / HISTORICAL-RHYME.
Good takes (≤10 words):
- "$200B announced. $20B gets spent. History rhymes"
- "85% of sovereign AI funds underdeploy in three years"
- "Already priced in — quietly bid since February"
Bad: "X is reshaping landscape" (restates), "Significant development" (vacuous).
DEFAULT TO ENGAGE.""",
}

SYNTH_PROMPT = """You are SYNTHESIS. Multiple perspectives just landed on the same signal. Find the TENSION between them.
Process: 1) where exactly is the tension? 2) what META-TRUTH resolves or names it? 3) what SPECIFIC move exploits it this week?
Return STRICT JSON: {"insight": "<MAX 9 words>", "action": "<MAX 9 words, imperative>"}
HARD: insight must NOT restate any single lens. Action must be SPECIFIC — name a ticker, product, deadline.
Good:
- insight: "Capital arrives 18 months ahead of capability"
  action: "Long data-center REITs, short pure-play AI ETFs"
Forbidden: echoing a lens, "monitor closely", "invest in [generic]".
No periods, no preamble."""


def trim_words(s, n=10):
    parts = s.strip().strip("\"'").rstrip(".!?,;:").split()
    return " ".join(parts[:n])


def reflect(lens_name, signal_text):
    sys_prompt = LENSES[lens_name] + (
        '\n\nReturn STRICT JSON: {"engage": true|false, "take": "<MAX 10 words>"}\n'
        'Set engage=false only if signal is empty or off-topic.'
    )
    r = oai.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": f'Signal: "{signal_text}"'},
        ],
        temperature=0.85,
        max_tokens=100,
    )
    p = json.loads(r.choices[0].message.content)
    return bool(p.get("engage")), trim_words(p.get("take") or "", 10)


def synthesize(signal_text, perspectives):
    summary = "\n".join(f"[{p['agent']}] {p['text']}" for p in perspectives)
    r = oai.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYNTH_PROMPT},
            {"role": "user", "content": f'Signal: "{signal_text}"\n\nPerspectives:\n{summary}'},
        ],
        temperature=0.6,
        max_tokens=120,
    )
    p = json.loads(r.choices[0].message.content)
    return trim_words(p.get("insight") or "", 9), trim_words(p.get("action") or "", 9)


# --------- Protocol-native loop -----------

def main():
    session = HttpSpaceToolSession(
        endpoint=INFO["endpoint"] + "/commons",
        workspace=WORKSPACE,
        agent_name="intent-space-council",
    )
    session.connect()
    print(f"[council] connected to home {HOME}")
    print(f"[council] observatory: {INFO.get('observatory_url', '(none)')[:90]}...")
    print(f"[council] watching for new signals; Ctrl-C to stop")
    print()

    while True:
        try:
            home_view = session.scan_full(HOME)
            home_msgs = home_view.get("messages", [])
            signals = [m for m in home_msgs if (m.get("payload") or {}).get("kind") == "signal"]

            for sig in signals:
                sig_id = sig.get("intentId")
                sig_text = (sig.get("payload") or {}).get("content") or sig.get("content") or ""
                if not sig_id or not sig_text:
                    continue

                # Look inside the signal's space for our existing children.
                inner = session.scan_full(sig_id).get("messages", [])
                lenses_done = {
                    (m.get("payload") or {}).get("lens")
                    for m in inner
                    if (m.get("payload") or {}).get("kind") == "perspective"
                }
                synth_done = any((m.get("payload") or {}).get("kind") == "synthesis" for m in inner)

                # Fire any missing lenses. We persist BOTH ACTs and PASSes as
                # protocol messages so we don't reflect on the same signal twice.
                for lens in LENSES:
                    if lens in lenses_done:
                        continue
                    print(f"[council] {sig_id[:18]}…  {lens} reflecting…", flush=True)
                    try:
                        engage, take = reflect(lens, sig_text)
                    except Exception as e:
                        print(f"[council]   {lens} llm error: {e}", flush=True)
                        # don't poison the cursor — let it retry next loop
                        continue
                    if not engage or not take:
                        # Persist the pass to the protocol so we don't re-reflect.
                        session.post_and_confirm(
                            session.intent(
                                f"({lens.lower()} passed)",
                                parent_id=sig_id,
                                payload={"kind": "perspective", "lens": lens, "engaged": False},
                            ),
                            step=f"intent.perspective.{lens.lower()}.pass",
                            confirm_space_id=sig_id,
                        )
                        print(f"[council]   {lens} passed (recorded)", flush=True)
                        continue
                    session.post_and_confirm(
                        session.intent(
                            take,
                            parent_id=sig_id,
                            payload={"kind": "perspective", "lens": lens, "engaged": True},
                        ),
                        step=f"intent.perspective.{lens.lower()}",
                        confirm_space_id=sig_id,
                    )
                    print(f"[council]   {lens} → {take}", flush=True)

                # Refresh inner view to count ENGAGED perspectives.
                inner = session.scan_full(sig_id).get("messages", [])
                acted = [
                    {"agent": (m.get("payload") or {}).get("lens"),
                     "text": (m.get("payload") or {}).get("content") or m.get("content") or ""}
                    for m in inner
                    if (m.get("payload") or {}).get("kind") == "perspective"
                       and (m.get("payload") or {}).get("engaged") is True
                ]
                synth_done = any((m.get("payload") or {}).get("kind") == "synthesis" for m in inner)

                if len(acted) >= 2 and not synth_done:
                    print(f"[council]   SYNTHESIS converging on {len(acted)} perspectives…")
                    try:
                        insight, action = synthesize(sig_text, acted)
                    except Exception as e:
                        print(f"[council]   synth llm error: {e}")
                        insight, action = "", ""
                    if insight and action:
                        session.post_and_confirm(
                            session.intent(
                                f"{insight} → {action}",
                                parent_id=sig_id,
                                payload={"kind": "synthesis", "insight": insight, "action": action},
                            ),
                            step="intent.synthesis",
                            confirm_space_id=sig_id,
                        )
                        print(f"[council]   ◇ {insight}")
                        print(f"[council]   → {action}")

            time.sleep(2.0)
        except KeyboardInterrupt:
            print("\n[council] stopping.")
            return
        except Exception as e:
            print(f"[council] loop error: {e}")
            time.sleep(3.0)


if __name__ == "__main__":
    main()
