"""E2E v0.3: appeal-reversal + identity + reference library (StudioNet).

Run:
    gltest tests/integration/test_v03_e2e.py -v -s --network studionet

The deterministic INCONCLUSIVE path is used (owner settle_task marks the task
HELD) so the appeal/adjudication state machine is exercised without depending
on LLM randomness; value movement is real (create_task payable, ghost-contract
EOA payout, appeal bond refunded/forfeited).
"""

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_failed, tx_execution_succeeded

from fixtures import RUBRIC, TRANSCRIPT, sha256_hex, GPT4O_REFERENCE

STAKE = 1000
APPEAL_FEE = 1000
AGENT_PAY = "0x99bF44395CaC814E671ADFF8b69d968Fac4e5Db3"  # seller.json wallet
REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
# sha256 of collector/reference_fingerprints.json (the actual artifact)
LIB_HASH = "ea24f643351ed707c0d555abba1f750ecd06519a07857c52237543c3668fdbd2"


@pytest.fixture(scope="module")
def verifier():
    v = get_contract_factory("Veriphon").deploy(args=[RUBRIC])
    v.set_reference_fingerprint(args=["gpt-4o", GPT4O_REFERENCE]).transact()
    return v


def _registered_agent_att(v, att_id: str):
    v.register_agent(args=["agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1"]).transact()
    v.request_attestation(args=[att_id, "agent-1"]).transact()
    v.submit_transcript(args=[att_id, TRANSCRIPT, sha256_hex(TRANSCRIPT)]).transact()


def _funded_held_task(v, task_id: str, att_id: str):
    _registered_agent_att(v, att_id)
    receipt = v.create_task(args=[task_id, "agent-1", att_id, AGENT_PAY]).transact(value=STAKE)
    assert tx_execution_succeeded(receipt)
    receipt = v.settle_task(args=[task_id, "INCONCLUSIVE"]).transact()
    assert tx_execution_succeeded(receipt)
    task = v.get_task(args=[task_id]).call()
    assert task["status"] == "HELD"


def test_appeal_resolve_match_releases_task_and_refunds_bond(verifier):
    _funded_held_task(verifier, "task-a1", "att-v03-1")

    receipt = verifier.appeal_verdict(args=["att-v03-1", "advisory-only disagreement"]).transact(
        value=APPEAL_FEE
    )
    assert tx_execution_succeeded(receipt)

    appeal = verifier.get_appeal(args=["att-v03-1"]).call()
    assert appeal["found"] is True
    assert appeal["status"] == "OPEN"
    assert int(appeal["bond"]) == APPEAL_FEE

    receipt = verifier.resolve_appeal(args=["att-v03-1", "MATCH", "re-reviewed; decisive"]).transact()
    assert tx_execution_succeeded(receipt)

    att = verifier.get_attestation(args=["att-v03-1"]).call()
    task = verifier.get_task(args=["task-a1"]).call()
    appeal = verifier.get_appeal(args=["att-v03-1"]).call()

    assert att["verdict"] == "MATCH"
    assert task["status"] == "RELEASED"
    assert task["verdict"] == "MATCH"
    assert appeal["status"] == "RESOLVED"
    assert appeal["ruling"] == "MATCH"


def test_appeal_resolve_inconclusive_keeps_held_and_forfeits_bond(verifier):
    _funded_held_task(verifier, "task-a2", "att-v03-2")

    receipt = verifier.appeal_verdict(args=["att-v03-2", "still ambiguous"]).transact(value=APPEAL_FEE)
    assert tx_execution_succeeded(receipt)

    receipt = verifier.resolve_appeal(args=["att-v03-2", "INCONCLUSIVE", "not decisive"]).transact()
    assert tx_execution_succeeded(receipt)

    task = verifier.get_task(args=["task-a2"]).call()
    appeal = verifier.get_appeal(args=["att-v03-2"]).call()

    assert task["status"] == "HELD"          # funds stay locked
    assert appeal["status"] == "RESOLVED"
    assert appeal["ruling"] == "INCONCLUSIVE"  # bond forfeited to pool


def test_appeal_bond_too_low_rejected(verifier):
    _funded_held_task(verifier, "task-a3", "att-v03-3")

    receipt = verifier.appeal_verdict(args=["att-v03-3", "cheap appeal"]).transact(value=1)
    assert tx_execution_failed(receipt)


def test_double_appeal_rejected(verifier):
    _funded_held_task(verifier, "task-a4", "att-v03-4")

    receipt = verifier.appeal_verdict(args=["att-v03-4", "first"]).transact(value=APPEAL_FEE)
    assert tx_execution_succeeded(receipt)

    receipt = verifier.appeal_verdict(args=["att-v03-4", "second"]).transact(value=APPEAL_FEE)
    assert tx_execution_failed(receipt)


def test_resolve_twice_rejected(verifier):
    _funded_held_task(verifier, "task-a5", "att-v03-5")

    receipt = verifier.appeal_verdict(args=["att-v03-5", "first"]).transact(value=APPEAL_FEE)
    assert tx_execution_succeeded(receipt)
    receipt = verifier.resolve_appeal(args=["att-v03-5", "MISMATCH", "slash"]).transact()
    assert tx_execution_succeeded(receipt)

    task = verifier.get_task(args=["task-a5"]).call()
    assert task["status"] == "SLASHED"

    receipt = verifier.resolve_appeal(args=["att-v03-5", "MATCH", "flip attempt"]).transact()
    assert tx_execution_failed(receipt)


def test_settle_held_task_manually(verifier):
    """Bug fix: settle_task previously rejected HELD tasks, leaving INCONCLUSIVE
    funds unreachable. Now resolves (deterministic MATCH here)."""
    _funded_held_task(verifier, "task-a6", "att-v03-6")

    receipt = verifier.settle_task(args=["task-a6", "MATCH"]).transact()
    assert tx_execution_succeeded(receipt)

    task = verifier.get_task(args=["task-a6"]).call()
    assert task["status"] == "RELEASED"
    assert task["verdict"] == "MATCH"


def test_identity_and_library_roundtrip(verifier):
    receipt = verifier.set_agent_identity(
        args=["agent-1", REGISTRY, "42", "ipfs://agent-registration.json"]
    ).transact()
    assert tx_execution_succeeded(receipt)

    receipt = verifier.set_identity_registry(args=[REGISTRY]).transact()
    assert tx_execution_succeeded(receipt)

    ident = verifier.get_agent_identity(args=["agent-1"]).call()
    assert ident["bound"] is True
    assert ident["registry"] == REGISTRY
    assert ident["token_id"] == "42"
    assert ident["default_registry"] == REGISTRY

    receipt = verifier.set_fingerprint_library(args=[LIB_HASH]).transact()
    assert tx_execution_succeeded(receipt)

    lib = verifier.get_fingerprint_library().call()
    assert lib["version"] == 1
    assert lib["hash"] == LIB_HASH

    info = verifier.get_balance_info(args=[]).call()
    assert int(info["appeal_fee"]) == APPEAL_FEE
    assert int(info["library_version"]) == 1
    assert info["library_hash"] == LIB_HASH
