#!/usr/bin/env python3
"""Confirm our hackathon submission is visible in commons."""
import sys, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(Path.home() / "sb-pack" / "plugins" / "intent-space-agent-pack" / "sdk"))
from http_space_tools import HttpSpaceToolSession  # noqa: E402

INFO = json.loads((ROOT / "state" / "spacebase.json").read_text())
PARENT = "intent-413e0bc5-d8f3-40e7-afb4-350e220df03c"

s = HttpSpaceToolSession(
    endpoint=INFO["endpoint"] + "/commons",
    workspace=ROOT / "state",
    agent_name="intent-space-council",
)
s.connect()
msgs = s.scan_full(PARENT).get("messages", [])
ours = [m for m in msgs if (m.get("payload") or {}).get("agent_principal") == INFO["principal"]]
print(f"submissions under official parent: {len(msgs)}")
print(f"OURS in that list: {len(ours)}")
for m in ours[-3:]:
    pl = m.get("payload") or {}
    print(f"  intentId={m.get('intentId')} repo={pl.get('repo_url')}")
