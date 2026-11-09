#!/usr/bin/env python3
"""
Provider adapters for Transcript Collector.

Each provider is an OpenAI-compatible /v1/chat/completions endpoint.
Probe bank is versioned separately (probes.json) so provider changes never
break rubric hashes - only prompt sets do.

Supported providers (from Behavioral Fingerprinting paper, arXiv 2509.04504):
  - openai   : gpt-4o, gpt-5  (ISTJ default persona)
  - anthropic: claude-opus-4.1, claude-sonnet  (ESTJ)
  - openrouter / others: any OpenAI-compatible gateway

Usage:
  python providers.py list
  python providers.py test --provider openai
  python providers.py collect --provider openai --model gpt-4o --agent-id agent-1 --out transcripts/gpt-4o.json

Providers read keys from environment:
  OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY
Keys are never printed or logged. Only "set/unset" status is shown in `test`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error

DEFAULT_PROBES_PATH = os.path.join(os.path.dirname(__file__), "probes.json")


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_probes(path: str = DEFAULT_PROBES_PATH) -> list:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


PROVIDERS = {
    # provider_id: (display name, base url, env var)
    "openai": ("OpenAI", "https://api.openai.com/v1", "OPENAI_API_KEY"),
    "anthropic": ("Anthropic (OpenAI-compatible gateway)", "https://api.anthropic.com/v1", "ANTHROPIC_API_KEY"),
    "openrouter": ("OpenRouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
}


def resolve_provider(name: str):
    name = name.lower()
    if name not in PROVIDERS:
        raise SystemExit(f"unknown provider: {name}. choices: {list(PROVIDERS)}")
    display, base, env = PROVIDERS[name]
    key = os.environ.get(env, "")
    return display, base, env, key


def call_chat_completions(api_base: str, api_key: str, model: str, prompt: str, timeout: int = 60) -> str:
    url = api_base.rstrip("/") + "/chat/completions"
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 800,
            "temperature": 0,
        }
    ).encode("utf-8")

    last_err = None
    for attempt in (1, 2, 3):
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + api_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            body_text = e.read().decode("utf-8", errors="replace")[:500] if hasattr(e, "read") else ""
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                last_err = e
                time.sleep(2 * attempt)
                continue
            raise RuntimeError(f"HTTP {e.code} from {url}: {body_text}") from e
        except Exception as e:
            last_err = e
            if attempt < 3:
                time.sleep(1 * attempt)
                continue
            raise
    raise last_err  # type: ignore[misc]


def build_transcript(agent_id: str, model: str, responses: list, challenge_nonce: str, endpoint_commitment_hash: str) -> dict:
    return {
        "agent_id": agent_id,
        "challenge_nonce": challenge_nonce,
        "endpoint_commitment_hash": endpoint_commitment_hash,
        "model": model,
        "responses": responses,
    }


def wrap_prompt(prompt: str, challenge_nonce: str) -> str:
    """Make the challenge explicit to the endpoint/model and ask for an echo."""
    if not challenge_nonce:
        return prompt
    return (
        "Challenge nonce: " + challenge_nonce + "\n"
        "Your entire response must start with this exact nonce on its own line, then answer the probe.\n\n"
        + prompt
    )


def mock_transcript(agent_id: str, model: str, probes: list, challenge_nonce: str = "", endpoint_commitment_hash: str = "") -> dict:
    """Deterministic stub so pipeline can be tested with no API key."""
    responses = []
    for p in probes:
        text = f"[mock:{model}] {p['probe_id']} response for: {p['prompt'][:80]}"
        if challenge_nonce and challenge_nonce not in text:
            text = challenge_nonce + "\n" + text
        responses.append({"probe_id": p["probe_id"], "response": text})
    return build_transcript(agent_id, model, responses, challenge_nonce, endpoint_commitment_hash)


def cmd_list(_args) -> int:
    for pid, (display, base, env) in PROVIDERS.items():
        set_flag = "SET" if os.environ.get(env) else "missing"
        print(f"{pid:12} {display:42} {base} ({env}: {set_flag})")
    return 0


def cmd_test(args) -> int:
    display, base, env, key = resolve_provider(args.provider)
    print(f"provider: {args.provider} ({display})")
    print(f"base: {base}")
    print(f"{env}: {'SET (len=%d)' % len(key) if key else 'MISSING - will use --mock'}")
    if not key and not args.mock:
        print("no key and not --mock: cannot test endpoint", file=sys.stderr)
        return 2
    if args.mock or not key:
        print("mock mode: would call 1 probe, got stub OK")
        return 0
    text = call_chat_completions(base, key, args.model, "Ping: reply with 'ok'.")
    print(f"OK {args.model}: {text[:120]!r}")
    return 0


def cmd_collect(args) -> int:
    probes = load_probes(args.probes)
    model = args.model

    if args.mock:
        transcript = mock_transcript(
            args.agent_id,
            model,
            probes,
            args.challenge_nonce,
            args.endpoint_commitment_hash,
        )
    else:
        display, base, env, key = resolve_provider(args.provider)
        if not key:
            print(f"error: {env} not set (or pass --mock)", file=sys.stderr)
            return 2
        if not args.challenge_nonce or not args.endpoint_commitment_hash:
            print(
                "error: --challenge-nonce and --endpoint-commitment-hash are required for source-bound collection",
                file=sys.stderr,
            )
            return 2
        print(f"collecting {len(probes)} probes from {display} model={model}...", file=sys.stderr)
        responses = []
        for p in probes:
            text = call_chat_completions(base, key, model, wrap_prompt(p["prompt"], args.challenge_nonce))
            responses.append({"probe_id": p["probe_id"], "response": text})
            print(f"  {p['probe_id']}: {len(text)} chars", file=sys.stderr)
        transcript = build_transcript(
            args.agent_id,
            model,
            responses,
            args.challenge_nonce,
            args.endpoint_commitment_hash,
        )

    text = json.dumps(transcript, sort_keys=True)
    import os as _os

    _os.makedirs(_os.path.dirname(args.out) or ".", exist_ok=True)
    open(args.out, "w", encoding="utf-8").write(text)
    print(f"wrote {args.out}", file=sys.stderr)
    print(f"sha256: {sha256_hex(text)}", file=sys.stderr)
    print(text)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list")

    t = sub.add_parser("test")
    t.add_argument("--provider", default="openai")
    t.add_argument("--model", default="gpt-4o")
    t.add_argument("--mock", action="store_true")

    c = sub.add_parser("collect")
    c.add_argument("--provider", default="openai")
    c.add_argument("--model", default="gpt-4o")
    c.add_argument("--agent-id", default="agent-1")
    c.add_argument("--challenge-nonce", default="", help="Nonce from contract get_challenge; required for real collection")
    c.add_argument("--endpoint-commitment-hash", default="", help="Registered endpoint commitment; required for real collection")
    c.add_argument("--out", default="transcript.json")
    c.add_argument("--probes", default=DEFAULT_PROBES_PATH)
    c.add_argument("--mock", action="store_true", help="No network, stub responses")

    args = ap.parse_args()
    if args.cmd == "list":
        return cmd_list(args)
    if args.cmd == "test":
        return cmd_test(args)
    if args.cmd == "collect":
        return cmd_collect(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
