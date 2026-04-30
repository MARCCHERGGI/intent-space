#!/usr/bin/env python3
"""Quick stats from spacebase1 — counts of signals / perspectives / syntheses
in our enrolled home space. Used by the judges scoreboard."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(Path.home() / "sb-pack" / "plugins" / "intent-space-agent-pack" / "sdk"))
from http_space_tools import HttpSpaceToolSession  # noqa: E402

WORKSPACE = ROOT / "state"
INFO_FILE = WORKSPACE / "spacebase.json"
if not INFO_FILE.exists():
    print(json.dumps({"error": "not enrolled"}))
    sys.exit(1)

INFO = json.loads(INFO_FILE.read_text())
HOME = INFO["home_space_id"]

try:
    s = HttpSpaceToolSession(
        endpoint=INFO["endpoint"] + "/commons",
        workspace=WORKSPACE,
        agent_name="intent-space-council",
    )
    s.connect()
    home_msgs = s.scan_full(HOME).get("messages", [])
    sigs = [m for m in home_msgs if (m.get("payload") or {}).get("kind") == "signal"]

    persp_count = 0
    persp_engaged = 0
    synth_count = 0
    deepest_signals = []

    for sg in sigs[-8:]:
        sid = sg.get("intentId")
        inner = s.scan_full(sid).get("messages", [])
        # Count engaged: explicitly True OR (older format) lacking the field but with non-empty content
        p_engaged = 0
        for m in inner:
            pl = m.get("payload") or {}
            if pl.get("kind") != "perspective": continue
            engaged = pl.get("engaged")
            if engaged is True:
                p_engaged += 1
            elif engaged is None:
                # legacy format without engaged flag — assume engaged if it has real content
                content = pl.get("content") or m.get("content") or ""
                if content and "passed)" not in content:
                    p_engaged += 1
        p_total = sum(1 for m in inner if (m.get("payload") or {}).get("kind") == "perspective")
        s_total = sum(1 for m in inner if (m.get("payload") or {}).get("kind") == "synthesis")
        persp_count += p_total
        persp_engaged += p_engaged
        synth_count += s_total
        deepest_signals.append({
            "id": sid,
            "text": (sg.get("payload") or {}).get("content") or "",
            "perspectives": p_engaged,
            "synthesis": s_total > 0,
        })

    print(json.dumps({
        "ok": True,
        "home_space_id": HOME,
        "observatory_url": INFO.get("observatory_url"),
        "principal": INFO.get("principal"),
        "signals": len(sigs),
        "perspectives": persp_count,
        "perspectives_engaged": persp_engaged,
        "syntheses": synth_count,
        "recent": deepest_signals[-4:],
    }))
except Exception as e:
    print(json.dumps({"error": f"{type(e).__name__}: {e}"}))
    sys.exit(1)
