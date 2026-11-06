"""On-chain smoke test for the CANONICAL deployed v0.3.1 contract.

Runs the full happy path against the address the frontend points to, so a
visitor inspecting the explorer sees the whole lifecycle, not just a deploy:

    register_agent -> request_attestation -> submit_transcript
    -> create_task (payable 1000) -> verify_fingerprint (real LLM consensus)
    -> atomic settle inside the same transaction

Then reads back attestation, task and balance info.

Usage:
    python scripts/smoke_onchain.py
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
AGENT_PAY = "0x99bF44395CaC814E671ADFF8b69d968Fac4e5Db3"  # seller.json wallet
STAKE = 1000
RUN = str(int(time.time()))
AGENT_ID = f"smoke-agent-{RUN}"
ATT_ID = f"smoke-att-{RUN}"
TASK_ID = f"smoke-task-{RUN}"

c = get_gl_client()
variant = getattr(TransactionHashVariant, "LATEST_FINAL", None)


def write(label, function_name, args, value=0):
    print(f"[write] {label} ...")
    tx = c.write_contract(address=CONTRACT, function_name=function_name, args=args, value=value)
    print(f"        tx: {tx}")
    for i in range(60):
        r = c.get_transaction(tx)
        status = r.get("status") if isinstance(r, dict) else None
        if status in (5, 7):
            print(f"        final status={status} result={r.get('result')}")
            return tx
        time.sleep(5)
    raise RuntimeError(f"{label} did not finalize")


def read(function_name, args):
    return c.read_contract(
        address=CONTRACT,
        function_name=function_name,
        args=args,
        transaction_hash_variant=variant,
    )


write("register_agent", "register_agent", [AGENT_ID, "gpt-4o", "2024-11-20", "endpoint-hash-smoke"])
write("request_attestation", "request_attestation", [ATT_ID, AGENT_ID])
write("submit_transcript", "submit_transcript", [ATT_ID, TRANSCRIPT, sha256_hex(TRANSCRIPT)])
write("create_task (payable)", "create_task", [TASK_ID, AGENT_ID, ATT_ID, AGENT_PAY], value=STAKE)
write("verify_fingerprint (LLM consensus)", "verify_fingerprint", [ATT_ID, TRANSCRIPT])

print("\n[read] attestation:", json.dumps(read("get_attestation", [ATT_ID]), indent=2)[:600])
print("\n[read] task:", json.dumps(read("get_task", [TASK_ID]), indent=2))
print("\n[read] balance_info:", json.dumps(read("get_balance_info", []), indent=2))
print("\n[read] is_verified:", read("is_verified", [AGENT_ID, "gpt-4o"]))
print("\nDone. Smoke txs are on the canonical contract; check the explorer.")
