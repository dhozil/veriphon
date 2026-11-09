"""Seed remaining demo state on the CANONICAL v0.4.1 contract.

1. Bind ERC-8004 identity for agent-1 (owner-set): registry + token_id + uri,
   and set the default identity registry so the UI shows a consistent value.
2. Create escrow task "task-1" (payable 1000) bound to att-1. It stays FUNDED
   so the /escrow lookup demo shows a live, open escrow state.

Usage:
    python scripts/seed_identity_and_task.py
"""

import sys
import time
import json

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

CONTRACT = "0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F"
REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"  # ERC-8004 identity registry (conventional)
TOKEN_ID = "1"
AGENT_URI = "ipfs://veriphon-agent-1"
AGENT_ID = "agent-1"
ATT_ID = "att-1"
TASK_ID = "task-1"
AGENT_PAY = "0x99bF44395CaC814E671ADFF8b69d968Fac4e5Db3"
STAKE = 1000

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


print("== identity ==")
ident = read("get_agent_identity", [AGENT_ID])
print("before:", json.dumps(ident, indent=2))
if not ident["bound"]:
    write("set_agent_identity", "set_agent_identity", [AGENT_ID, REGISTRY, TOKEN_ID, AGENT_URI])
    write("set_identity_registry", "set_identity_registry", [REGISTRY])
else:
    print("agent-1 already identity-bound, skipping.")
print("after:", json.dumps(read("get_agent_identity", [AGENT_ID]), indent=2))

print("\n== escrow task ==")
try:
    task = read("get_task", [TASK_ID])
    print("task-1 exists:", json.dumps(task, indent=2))
except Exception:
    write("create_task", "create_task", [TASK_ID, AGENT_ID, ATT_ID, AGENT_PAY], value=STAKE)
    print("after create:", json.dumps(read("get_task", [TASK_ID]), indent=2))

print("\n[read] balance_info:", json.dumps(read("get_balance_info", []), indent=2))
print("\nDone.")

