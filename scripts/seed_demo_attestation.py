"""Seed a canonical demo attestation (agent-1 / att-1) on the v0.4 contract.

Registers agent-1 (gpt-4o), opens att-1, submits the shared demo transcript,
then verifies it with the GROUNDED judge (real validator LLM consensus, bound
to the on-chain reference fingerprint). The /verify page then renders live
verdict + grounded rationale (quote + axis per probe).

Usage:
    python scripts/seed_demo_attestation.py
"""

import sys
import time
import json

sys.path.insert(0, "tests/direct")
from fixtures import TRANSCRIPT, sha256_hex  # noqa: E402

from dotenv import load_dotenv  # noqa: E402

load_dotenv(".env.studionet")

from gltest_cli.config.user import load_user_config  # noqa: E402
from gltest_cli.config.general import get_general_config  # noqa: E402
from gltest_cli.config.types import PluginConfig  # noqa: E402

gc = get_general_config()
gc.user_config = load_user_config("gltest.config.yaml")
gc.plugin_config = PluginConfig()

from gltest.clients import get_gl_client  # noqa: E402
from genlayer_py.types import TransactionHashVariant  # noqa: E402

CONTRACT = "0x9D217b1d1c7AbCB18deA200764c3707437261153"
AGENT_ID = "agent-1"
ATT_ID = "att-1"

c = get_gl_client()
variant = getattr(TransactionHashVariant, "LATEST_FINAL", None)


def write(label, function_name, args, value=0):
    print(f"[write] {label} ...")
    tx = c.write_contract(address=CONTRACT, function_name=function_name, args=args, value=value)
    for i in range(60):
        r = c.get_transaction(tx)
        status = r.get("status") if isinstance(r, dict) else None
        if status in (5, 7):
            print(f"        tx: {tx}  status={status} result={r.get('result')}")
            return tx
        time.sleep(5)
    raise RuntimeError(f"{label} did not finalize")


def read(function_name, args):
    return c.read_contract(address=CONTRACT, function_name=function_name, args=args, transaction_hash_variant=variant)


def has_agent():
    try:
        c.read_contract(address=CONTRACT, function_name="get_agent", args=[AGENT_ID], transaction_hash_variant=variant)
        return True
    except Exception:
        return False


if has_agent():
    print("agent-1 already registered, skipping register.")
else:
    write("register_agent(agent-1)", "register_agent", [AGENT_ID, "gpt-4o", "2024-11-20", "endpoint-hash-1"])

try:
    att = c.read_contract(address=CONTRACT, function_name="get_attestation", args=[ATT_ID], transaction_hash_variant=variant)
    print("att-1 exists:", att["status"])
except Exception:
    write("request_attestation(att-1)", "request_attestation", [ATT_ID, AGENT_ID])
    write("submit_transcript(att-1)", "submit_transcript", [ATT_ID, TRANSCRIPT, sha256_hex(TRANSCRIPT)])

write("verify_fingerprint(att-1)", "verify_fingerprint", [ATT_ID, TRANSCRIPT])

print("\n[read] attestation:", json.dumps(read("get_attestation", [ATT_ID]), indent=2))
print("\n[read] is_verified(agent-1, gpt-4o):", read("is_verified", [AGENT_ID, "gpt-4o"]))
print("\nDone. /verify on the frontend now shows live att-1 with grounded rationale.")
