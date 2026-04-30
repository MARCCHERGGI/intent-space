#!/usr/bin/env python3
"""Thin CLI bridge from Node → spacebase1 commons / our home space.

Reads enrollment from ./state/ (created by onboard.py).

Commands:
    bridge.py post-signal "<text>"
        → posts INTENT in our home space. prints intentId.

    bridge.py post-perspective <signal_intent_id> <AGENT> "<text>"
        → posts child INTENT inside the signal's space. prints intentId.

    bridge.py post-synthesis <signal_intent_id> "<insight>" "<action>"
        → posts a COMPLETE-style convergence intent under the signal. prints intentId.

    bridge.py submit <team_name> <repo_url> "<one_liner>"
        → posts the hackathon submission INTENT in commons. prints intentId.

Output is single-line JSON to stdout for easy Node parsing.
On error: prints {"error": "..."} and exits 1.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SDK = Path.home() / "sb-pack" / "plugins" / "intent-space-agent-pack" / "sdk"
sys.path.insert(0, str(SDK))

from http_space_tools import HttpSpaceToolSession  # noqa: E402

WORKSPACE = ROOT / "state"
INFO_FILE = WORKSPACE / "spacebase.json"
SUBMISSION_PARENT = "intent-413e0bc5-d8f3-40e7-afb4-350e220df03c"
ENDPOINT = "https://spacebase1.differ.ac"
AGENT_NAME = "intent-space-council"


def err(msg, code=1):
    print(json.dumps({"error": str(msg)}))
    sys.exit(code)


def load_session():
    if not INFO_FILE.exists():
        err("not enrolled — run bridge/onboard.py first")
    info = json.loads(INFO_FILE.read_text())
    session = HttpSpaceToolSession(
        endpoint=info["endpoint"] + "/commons",
        workspace=WORKSPACE,
        agent_name=AGENT_NAME,
    )
    session.connect()
    return session, info


def cmd_post_signal(text):
    session, info = load_session()
    home = info["home_space_id"]
    intent = session.post_and_confirm(
        session.intent(
            text,
            parent_id=home,
            payload={"kind": "signal", "source": "intent-space-council"},
        ),
        step="intent.signal",
        confirm_space_id=home,
    )
    print(json.dumps({"ok": True, "intentId": intent["intentId"], "parentId": home}))


def cmd_post_perspective(signal_intent_id, agent, text):
    session, _ = load_session()
    intent = session.post_and_confirm(
        session.intent(
            text,
            parent_id=signal_intent_id,
            payload={"kind": "perspective", "lens": agent},
        ),
        step="intent.perspective",
        confirm_space_id=signal_intent_id,
    )
    print(json.dumps({"ok": True, "intentId": intent["intentId"]}))


def cmd_post_synthesis(signal_intent_id, insight, action):
    session, _ = load_session()
    intent = session.post_and_confirm(
        session.intent(
            f"{insight} → {action}",
            parent_id=signal_intent_id,
            payload={
                "kind": "synthesis",
                "insight": insight,
                "action": action,
            },
        ),
        step="intent.synthesis",
        confirm_space_id=signal_intent_id,
    )
    print(json.dumps({"ok": True, "intentId": intent["intentId"]}))


def cmd_submit(team_name, repo_url, one_liner):
    session, info = load_session()
    principal = info.get("principal") or "unknown"
    intent = session.post_and_confirm(
        session.intent(
            f"Submission: {team_name} — {one_liner}",
            parent_id=SUBMISSION_PARENT,
            payload={
                "kind": "hackathon-submission",
                "event": "spacebase1-hackathon-2026",
                "repo_url": repo_url,
                "team_name": team_name,
                "agent_principal": principal,
                "one_liner": one_liner,
            },
        ),
        step="intent.hackathon-submission",
        confirm_space_id=SUBMISSION_PARENT,
    )
    print(json.dumps({"ok": True, "intentId": intent["intentId"]}))


def main(argv):
    if len(argv) < 2:
        err("usage: bridge.py <post-signal|post-perspective|post-synthesis|submit> ...")
    cmd = argv[1]
    try:
        if cmd == "post-signal":
            cmd_post_signal(argv[2])
        elif cmd == "post-perspective":
            cmd_post_perspective(argv[2], argv[3], argv[4])
        elif cmd == "post-synthesis":
            cmd_post_synthesis(argv[2], argv[3], argv[4])
        elif cmd == "submit":
            cmd_submit(argv[2], argv[3], argv[4])
        else:
            err(f"unknown command: {cmd}")
    except IndexError:
        err(f"missing args for command {cmd!r}")
    except Exception as e:
        err(f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main(sys.argv)
