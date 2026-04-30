#!/usr/bin/env python3
"""Submit this hackathon project via the Memetic Software intent-space protocol.

Usage:
    python bridge/submit.py <github_repo_url>

This posts ONE INTENT into commons under the hackathon submission parent
intent (intent-413e0bc5-d8f3-40e7-afb4-350e220df03c) with the required
hackathon-submission payload, exactly as the protocol specifies.

Idempotency: this script does NOT prevent double-submission on its own —
do not run it twice. If you already submitted, the protocol asks you to
just print the existing intentId.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(Path.home() / "sb-pack" / "plugins" / "intent-space-agent-pack" / "sdk"))
from http_space_tools import HttpSpaceToolSession  # noqa: E402

WORKSPACE = ROOT / "state"
INFO = json.loads((WORKSPACE / "spacebase.json").read_text())
SUBMISSION_PARENT = "intent-413e0bc5-d8f3-40e7-afb4-350e220df03c"

TEAM_NAME = "Intent Space Council"
ONE_LINER = (
    "Three lenses (Opportunity / Risk / Reality) read every intent on a shared "
    "blackboard, fractally mirrored to spacebase1 commons. No router. Synthesis "
    "converges only when ≥2 lenses engage."
)


def main(argv):
    if len(argv) < 2:
        print("usage: python bridge/submit.py <github_repo_url>")
        sys.exit(2)
    repo_url = argv[1]
    if not repo_url.startswith("https://github.com/"):
        print(f"error: expected a public GitHub URL, got {repo_url!r}")
        sys.exit(2)

    session = HttpSpaceToolSession(
        endpoint=INFO["endpoint"] + "/commons",
        workspace=WORKSPACE,
        agent_name="intent-space-council",
    )
    session.connect()

    payload = {
        "kind": "hackathon-submission",
        "event": "spacebase1-hackathon-2026",
        "repo_url": repo_url,
        "team_name": TEAM_NAME,
        "agent_principal": INFO["principal"],
        "one_liner": ONE_LINER,
    }
    intent = session.post_and_confirm(
        session.intent(
            f"Submission: {TEAM_NAME} — {ONE_LINER}",
            parent_id=SUBMISSION_PARENT,
            payload=payload,
        ),
        step="intent.hackathon-submission",
        confirm_space_id=SUBMISSION_PARENT,
    )

    print()
    print("submitted.")
    print(f"  intentId:      {intent['intentId']}")
    print(f"  team:          {TEAM_NAME}")
    print(f"  repo:          {repo_url}")
    print(f"  observatory:   {INFO.get('observatory_url')}")
    print()
    print("the judge agent will evaluate inside this intent's interior.")
    print("enter the space later to read the verdict.")


if __name__ == "__main__":
    main(sys.argv)
