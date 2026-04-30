#!/usr/bin/env python3
"""Confirm our hackathon submission is visible in commons. Searches by team name."""
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
by_name = [m for m in msgs if (m.get("payload") or {}).get("team_name") == "Intent Space Council"]

print("=" * 60)
print(f"  HACKATHON SUBMISSION COMMONS — under parent {PARENT[:24]}...")
print("=" * 60)
print(f"  total submissions in parent: {len(msgs)}")
print(f"  ours (by principal):         {len(ours)}")
print(f"  ours (by team name search):  {len(by_name)}")
print()
print("  TEAM NAME:  Intent Space Council")
print("  PRINCIPAL:  " + INFO["principal"])
print()
for i, m in enumerate(ours, 1):
    pl = m.get("payload") or {}
    print(f"  [{i}] intent: {m.get('intentId')}")
    print(f"      team:   {pl.get('team_name')}")
    print(f"      kind:   {pl.get('kind')}")
    print(f"      event:  {pl.get('event')}")
    print(f"      repo:   {pl.get('repo_url')}")
    print()
