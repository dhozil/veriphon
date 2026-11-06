"""Deploy the CANONICAL v0.4.1 contract (grounded-LLM judge, Veriphon class) and load ground truth.

Steps (owner = GENLAYER_DEV_KEY from .env.studionet):
1. deploy with RUBRIC
2. set_fingerprint_library(sha256(reference_fingerprints.json))  -> v1
3. for each model family in collector/reference_fingerprints.json:
   set_reference_fingerprint(model_key, compact json)
4. print get_fingerprint_library + get_reference_fingerprint per model

Usage:
    python scripts/deploy_v04.py
"""

import sys
import time
import json
import hashlib

sys.path.insert(0, "tests/direct")
from fixtures import RUBRIC  # noqa: E402

from dotenv import load_dotenv  # noqa: E402

load_dotenv(".env.studionet")

from gltest_cli.config.user import load_user_config  # noqa: E402
from gltest_cli.config.general import get_general_config  # noqa: E402
from gltest_cli.config.types import PluginConfig  # noqa: E402

gc = get_general_config()
gc.user_config = load_user_config("gltest.config.yaml")
gc.plugin_config = PluginConfig()

from gltest.clients import get_gl_client  # noqa: E402
from gltest.utils import extract_contract_address  # noqa: E402
from genlayer_py.types import TransactionHashVariant  # noqa: E402

c = get_gl_client()
variant = getattr(TransactionHashVariant, "LATEST_FINAL", None)
LIB_PATH = "collector/reference_fingerprints.json"
LIB_BYTES = open(LIB_PATH, "rb").read()
LIB_HASH = hashlib.sha256(LIB_BYTES).hexdigest()
LIB = json.loads(LIB_BYTES)


def write(label, address, function_name, args, value=0):
    print(f"[write] {label} ...")
    tx = c.write_contract(address=address, function_name=function_name, args=args, value=value)
    for i in range(60):
        r = c.get_transaction(tx)
        status = r.get("status") if isinstance(r, dict) else None
        if status in (5, 7):
            print(f"        tx: {tx}  status={status} result={r.get('result')}")
            return tx
        time.sleep(5)
    raise RuntimeError(f"{label} did not finalize")


print("deploying v0.4 contract ...")
code = open("contracts/model_fingerprint_verifier.py", encoding="utf-8").read()
deploy_tx = c.deploy_contract(code=code, args=[RUBRIC])
print("deploy tx:", deploy_tx)
address = None
for i in range(60):
    r = c.get_transaction(deploy_tx)
    status = r.get("status") if isinstance(r, dict) else None
    print("deploy poll", i, "status", status)
    if status in (5, 7):
        address = extract_contract_address(r)
        break
    time.sleep(6)
print("deployed at:", address)

write("set_fingerprint_library", address, "set_fingerprint_library", [LIB_HASH])
for model_key, fp in LIB["models"].items():
    payload = json.dumps(
        {
            "family": fp.get("family"),
            "persona": fp.get("persona"),
            "axes": fp.get("axes"),
            "notes": fp.get("notes"),
        },
        sort_keys=True,
    )
    write(f"set_reference_fingerprint({model_key})", address, "set_reference_fingerprint", [model_key, payload])

print("\n[read] library:", c.read_contract(address=address, function_name="get_fingerprint_library", args=[], transaction_hash_variant=variant))
for model_key in LIB["models"]:
    fp = c.read_contract(address=address, function_name="get_reference_fingerprint", args=[model_key], transaction_hash_variant=variant)
    print(f"[read] reference {model_key}: found={fp.get('found')}")

print("\nDONE. Set NEXT_PUBLIC_CONTRACT_ADDRESS=" + address)
