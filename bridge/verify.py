#!/usr/bin/env python3
"""Verify the last mirrored signal landed on spacebase1, and print its space tree."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(Path.home() / "sb-pack" / "plugins" / "intent-space-agent-pack" / "sdk"))
from http_space_tools import HttpSpaceToolSession

WORKSPACE = ROOT / "state"
INFO = json.loads((WORKSPACE / "spacebase.json").read_text())
session = HttpSpaceToolSession(
    endpoint=INFO["endpoint"] + "/commons",
    workspace=WORKSPACE,
    agent_name="intent-space-council",
)
session.connect()

home = INFO["home_space_id"]
home_scan = session.scan_full(home)
msgs = home_scan.get("messages", [])
intents = [m for m in msgs if m.get("verb") == "INTENT" and m.get("payload", {}).get("kind") == "signal"]

print(f"home space: {home}")
print(f"signal intents found: {len(intents)}")
if not intents:
    print("none yet — bridge may still be in flight")
    sys.exit(0)

latest = intents[-1]
sig_id = latest["intentId"]
print(f"\nlatest signal: {sig_id}")
print(f"  content: {latest.get('content')}")

inner = session.scan_full(sig_id)
inner_msgs = inner.get("messages", [])
children = [m for m in inner_msgs if m.get("verb") == "INTENT"]
print(f"\nfractal children inside that signal: {len(children)}")
for c in children:
    p = c.get("payload", {})
    kind = p.get("kind") or "?"
    extra = p.get("lens") or (p.get("insight") and f"{p.get('insight')} → {p.get('action')}") or ""
    print(f"  [{kind:11}] {extra[:60] if extra else (c.get('content') or '')[:60]}")
