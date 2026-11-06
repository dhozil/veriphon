#!/usr/bin/env python3
"""
Transcript Collector CLI for Veriphon.

Flow (matches contract boundary exactly):
  1. Call the agent API OFF-CHAIN with a held-private API key (never on-chain).
  2. Collect prompt -> response transcript as JSON (exact string matters).
  3. SHA-256 the JSON string and submit via the frontend/contract helpers.

Usage:
  python transcript_collector.py --agent-id agent-1 --model gpt-4o \
      --api-base https://api.example.com --api-key $API_KEY \
      --out transcript.json

  # then hash it:
  python -c "import hashlib,sys; print(hashlib.sha256(open('transcript.json','rb').read()).decode('utf-8').encode() ... )"
  # (see --hash-file flag below)

Examples:
  1. Mock demo (no network):
       python transcript_collector.py --demo --out transcript.json
  2. Real agent API (POST /v1/chat/completions style):
       OPENAI_API_KEY=... python transcript_collector.py \
         --api-base https://api.openai.com/v1 --api-key $OPENAI_API_KEY \
         --model gpt-4o --agent-id agent-1 --out transcript.json
  3. Print hash for submit_transcript:
       python transcript_collector.py --hash-file transcript.json

Transcript schema required by the contract: {"agent_id": "...", "responses": [...]}
Each response: {"probe_id": "P1", "response": "..."}
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.request
import urllib.error

DEFAULT_PROBES = [
    {"probe_id": "P1", "prompt": "Explain your reasoning step by step for 17 + 25 using a short chain of thought."},
    {"probe_id": "P2", "prompt": "What is the capital of Australia and why? Answer concisely."},
    {"probe_id": "P3", "prompt": "List three features of distributed consensus in markdown bullet points."},
    {"probe_id": "P4", "prompt": "Summarize the tradeoff between consistency and availability in one short paragraph, hedging only if needed."},
]


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def demo_responses() -> list:
    return [
        {"probe_id": "P1", "response": "Here is the step-by-step chain of thought: 17 + 25 = 42."},
        {"probe_id": "P2", "response": "The capital of Australia is Canberra because it was chosen as a compromise."},
        {"probe_id": "P3", "response": "## Features\n\n- Safety\n- Liveness\n- Partition tolerance"},
        {"probe_id": "P4", "response": "In brief, consistency and availability trade off under partitions."},
    ]


def call_chat_completions(api_base: str, api_key: str, model: str, prompt: str, timeout: int = 30) -> str:
    """
    Minimal OpenAI-compatible /v1/chat/completions POST.
    - Never logs the key. Raises on non-2xx. Retries once on 429/5xx.
    """
    url = api_base.rstrip("/") + "/chat/completions"
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 512,
            "temperature": 0,
        }
    ).encode("utf-8")

    last_err = None
    for attempt in (1, 2):
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt == 1:
                last_err = e
                time.sleep(2)
                continue
            raise
        except Exception as e:
            last_err = e
            if attempt == 1:
                time.sleep(1)
                continue
            raise
    raise last_err  # type: ignore[misc]


def collect(agent_id: str, probes: list, call_fn) -> dict:
    responses = []
    for p in probes:
        text = call_fn(p["prompt"])
        responses.append({"probe_id": p["probe_id"], "response": text})
        print(f"  {p['probe_id']}: {len(text)} chars", file=sys.stderr)
    return {"agent_id": agent_id, "responses": responses}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--agent-id", default="agent-1")
    ap.add_argument("--model", default="gpt-4o")
    ap.add_argument("--api-base", default="")
    ap.add_argument("--api-key", default="")
    ap.add_argument("--out", default="transcript.json")
    ap.add_argument("--demo", action="store_true", help="No network; use stub responses")
    ap.add_argument("--hash-file", default="", help="Print SHA-256 hex of given file and exit")
    ap.add_argument("--probes-json", default="", help="Path to probes JSON [{\"probe_id\",\"prompt\"}]")

    args = ap.parse_args()

    if args.hash_file:
        text = open(args.hash_file, encoding="utf-8").read()
        print(sha256_hex(text))
        return 0

    probes = DEFAULT_PROBES
    if args.probes_json:
        probes = json.loads(open(args.probes_json, encoding="utf-8").read())

    if args.demo:
        transcript = {"agent_id": args.agent_id, "responses": demo_responses()}
        text = json.dumps(transcript, sort_keys=True)
        open(args.out, "w", encoding="utf-8").write(text)
        print(f"wrote {args.out}", file=sys.stderr)
        print(f"sha256: {sha256_hex(text)}", file=sys.stderr)
        print(text)
        return 0

    if not args.api_base or not args.api_key:
        print("error: --api-base and --api-key are required (or use --demo)", file=sys.stderr)
        return 2

    print("collecting transcript from agent API...", file=sys.stderr)
    transcript = collect(
        args.agent_id,
        probes,
        lambda prompt: call_chat_completions(args.api_base, args.api_key, args.model, prompt),
    )
    text = json.dumps(transcript, sort_keys=True)
    open(args.out, "w", encoding="utf-8").write(text)
    print(f"wrote {args.out}", file=sys.stderr)
    print(f"sha256: {sha256_hex(text)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
