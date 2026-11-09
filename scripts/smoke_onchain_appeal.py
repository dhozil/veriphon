"""On-chain smoke for the appeal-reversal path on the canonical source-bound contract.

Deterministic (no LLM consensus needed): exercise the owner recovery path and
the appeal state machine with real value movement:

    register_agent -> request_attestation -> get_challenge ->
    submit_transcript (challenge-bound) -> create_task (payable 1000) ->
    settle_task(INCONCLUSIVE)  [task HELD]
    -> appeal_verdict (payable bond 1000)  [appeal OPEN]
    -> resolve_appeal(MATCH)  [task RELEASED, bond refunded]

Reads back task, appeal and balance_info. Check the explorer afterwards.

Usage:
    python scripts/smoke_onchain_appeal.py
"""

import sys
import time
import json

sys.path.insert(0, "tests/direct")
from fixtures import TRANSCRIPT, sha256_hex, bound_transcript  # noqa: E402

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
AGENT_PAY = "0x99bF44395CaC814E671ADFF8b69d968Fac4e5Db3"  # seller.json wallet
STAKE = 1000
APPEAL_FEE = 1000
RUN = str(int(time.time()))
AGENT_ID = f"appeal-agent-{RUN}"
ATT_ID = f"appeal-att-{RUN}"
TASK_ID = f"appeal-task-{RUN}"

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


write("register_agent", "register_agent", [AGENT_ID, "gpt-4o", "2024-11-20", "endpoint-hash-appeal-smoke"])
write("request_attestation", "request_attestation", [ATT_ID, AGENT_ID])
challenge = c.read_contract(
    address=CONTRACT,
    function_name="get_challenge",
    args=[ATT_ID],
    transaction_hash_variant=getattr(TransactionHashVariant, "LATEST_NONFINAL", None),
)
bound = bound_transcript(TRANSCRIPT, challenge["challenge_nonce"], challenge["endpoint_commitment_hash"], agent_id=AGENT_ID)
write("submit_transcript", "submit_transcript", [ATT_ID, bound, sha256_hex(bound)])
write("create_task (payable)", "create_task", [TASK_ID, AGENT_ID, ATT_ID, AGENT_PAY], value=STAKE)
write("settle_task INCONCLUSIVE", "settle_task", [TASK_ID, "INCONCLUSIVE"])
write("appeal_verdict (bond)", "appeal_verdict", [ATT_ID, "smoke: held task re-review requested"], value=APPEAL_FEE)
write("resolve_appeal MATCH", "resolve_appeal", [ATT_ID, "MATCH", "smoke adjudication: release"])

print("\n[read] task:", json.dumps(read("get_task", [TASK_ID]), indent=2))
print("\n[read] appeal:", json.dumps(read("get_appeal", [ATT_ID]), indent=2))
print("\n[read] balance_info:", json.dumps(read("get_balance_info", []), indent=2))
print("\nDone. Appeal-path smoke txs are on the canonical contract.")

