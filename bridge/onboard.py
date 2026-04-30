#!/usr/bin/env python3
"""One-time onboarding: sign up at spacebase1 commons, get a home space.
After this, ./bridge.py can post intents on behalf of intent-space agents.

Usage:
    python onboard.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SDK = Path.home() / "sb-pack" / "plugins" / "intent-space-agent-pack" / "sdk"
if not SDK.exists():
    print(f"SDK not found at {SDK}. Clone https://github.com/sky-valley/claude-code-marketplace to ~/sb-pack first.")
    sys.exit(2)
sys.path.insert(0, str(SDK))

from http_space_tools import HttpSpaceToolSession  # noqa: E402

WORKSPACE = ROOT / "state"
WORKSPACE.mkdir(parents=True, exist_ok=True)

ENDPOINT = "https://spacebase1.differ.ac"
AGENT_NAME = "intent-space-council"


def main():
    print(f"[onboard] using workspace: {WORKSPACE}")
    session = HttpSpaceToolSession(
        endpoint=f"{ENDPOINT}/commons",
        workspace=WORKSPACE,
        agent_name=AGENT_NAME,
    )

    print("[onboard] signing up at commons...")
    session.signup(f"{ENDPOINT}/commons")
    session.connect()
    session.confirm_current_space()
    print("[onboard] enrolled. requesting home space...")

    request = session.post_and_confirm(
        session.intent(
            "Provision a home space for the intent-space-council demo.",
            parent_id="commons",
            payload={
                "requestedSpace": {"kind": "home"},
                "spacePolicy": {"visibility": "private"},
            },
        ),
        step="intent.provision-home-space",
        confirm_space_id="commons",
    )
    request_space = request["intentId"]
    print(f"[onboard] request intent posted: {request_space}")

    promise = session.wait_for_promise(request_space, wait_seconds=20.0)
    print(f"[onboard] promise received: {promise.get('promiseId')}")

    session.post_and_confirm(
        session.accept(promise_id=promise["promiseId"], parent_id=request_space),
        step="accept.provision-home-space",
        confirm_space_id=request_space,
    )

    complete = session.wait_for_complete(
        request_space, promise_id=promise["promiseId"], wait_seconds=30.0,
    )
    payload = complete["payload"]
    claim_url = payload["claim_url"]
    home_space_id = payload["home_space_id"]
    print(f"[onboard] complete. home_space_id={home_space_id}")

    session.signup(claim_url)
    session.connect()
    binding = session.verify_space_binding()
    print(f"[onboard] bound to {binding['currentSpaceId']}")
    print(f"[onboard] visible top-level intents: {binding['visibleTopLevelIntents']}")

    state_file = WORKSPACE / "intent-space-council.json"
    print(f"\nDONE. State persisted at {state_file}")
    print(f"home_space_id: {home_space_id}")
    sb = (WORKSPACE / "spacebase.json")
    enroll = __import__("json").loads((WORKSPACE / ".intent-space" / "state" / "station-enrollment.json").read_text())
    sb.write_text(__import__("json").dumps({
        "endpoint": ENDPOINT,
        "home_space_id": home_space_id,
        "principal": enroll.get("principal_id"),
        "observatory_url": enroll.get("observatory_url"),
    }, indent=2))
    print(f"home info saved to {sb}")


if __name__ == "__main__":
    main()
