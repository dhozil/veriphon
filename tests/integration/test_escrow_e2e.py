"""E2E escrow flow test: the monolithic Veriphon contract.

Run:
    gltest tests/integration/test_escrow_e2e.py -v -s --network studionet

Covers:
- Deterministic path: create_task (payable) -> settle_task (owner manual)
  for MATCH (release), MISMATCH (80/20 slash), INCONCLUSIVE (hold).
- Slow path (@pytest.mark.slow): full LLM consensus -> verify_fingerprint
  auto-settles the funded task atomically in the same transaction.
"""

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_failed, tx_execution_succeeded

from fixtures import RUBRIC, TRANSCRIPT, sha256_hex, GPT4O_REFERENCE

STAKE = 1000  # atto-GEN (testnet-scale units)
AGENT_PAY = "0x99bF44395CaC814E671ADFF8b69d968Fac4e5Db3"  # seller.json wallet


@pytest.fixture(scope="module")
def verifier():
    v = get_contract_factory("Veriphon").deploy(args=[RUBRIC])
    v.set_reference_fingerprint(args=["gpt-4o", GPT4O_REFERENCE]).transact()
    return v


def _registered_agent_att(v, att_id: str):
    v.register_agent(args=["agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1"]).transact()
    v.request_attestation(args=[att_id, "agent-1"]).transact()
    v.submit_transcript(args=[att_id, TRANSCRIPT, sha256_hex(TRANSCRIPT)]).transact()


def test_create_task_and_release_match(verifier):
    _registered_agent_att(verifier, "att-e2e-1")

    before = verifier.get_balance_info(args=[]).call()
    locked_before = int(before["total_locked"])

    receipt = verifier.create_task(
        args=["task-1", "agent-1", "att-e2e-1", AGENT_PAY]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(receipt)

    task = verifier.get_task(args=["task-1"]).call()
    assert task["status"] == "FUNDED"
    assert int(task["stake"]) == STAKE

    after_fund = verifier.get_balance_info(args=[]).call()
    assert int(after_fund["total_locked"]) == locked_before + STAKE

    # Owner manual settlement path: MATCH -> full stake to agent_payout
    receipt = verifier.settle_task(args=["task-1", "MATCH"]).transact()
    assert tx_execution_succeeded(receipt)

    task = verifier.get_task(args=["task-1"]).call()
    assert task["status"] == "RELEASED"
    assert task["verdict"] == "MATCH"

    after_release = verifier.get_balance_info(args=[]).call()
    assert int(after_release["total_locked"]) == locked_before


def test_mismatch_split_80_20(verifier):
    _registered_agent_att(verifier, "att-e2e-2")

    receipt = verifier.create_task(
        args=["task-2", "agent-1", "att-e2e-2", AGENT_PAY]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(receipt)

    receipt = verifier.settle_task(args=["task-2", "MISMATCH"]).transact()
    assert tx_execution_succeeded(receipt)

    task = verifier.get_task(args=["task-2"]).call()
    assert task["status"] == "SLASHED"
    assert task["verdict"] == "MISMATCH"


def test_inconclusive_holds_funds(verifier):
    _registered_agent_att(verifier, "att-e2e-3")

    receipt = verifier.create_task(
        args=["task-3", "agent-1", "att-e2e-3", AGENT_PAY]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(receipt)

    receipt = verifier.settle_task(args=["task-3", "INCONCLUSIVE"]).transact()
    assert tx_execution_succeeded(receipt)

    task = verifier.get_task(args=["task-3"]).call()
    assert task["status"] == "HELD"
    assert task["verdict"] == "INCONCLUSIVE"


def test_double_settle_rejected(verifier):
    _registered_agent_att(verifier, "att-e2e-4")

    receipt = verifier.create_task(
        args=["task-4", "agent-1", "att-e2e-4", AGENT_PAY]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(receipt)

    receipt = verifier.settle_task(args=["task-4", "MATCH"]).transact()
    assert tx_execution_succeeded(receipt)

    # Second settle must fail: task already settled
    receipt = verifier.settle_task(args=["task-4", "MATCH"]).transact()
    assert tx_execution_failed(receipt)


def test_create_task_requires_attestation(verifier):
    receipt = verifier.create_task(
        args=["task-5", "agent-1", "att-does-not-exist", AGENT_PAY]
    ).transact(value=STAKE)
    assert tx_execution_failed(receipt)


def test_set_min_stake_blocks_underfunded(verifier):
    receipt = verifier.set_min_stake(args=[5000]).transact()
    assert tx_execution_succeeded(receipt)

    _registered_agent_att(verifier, "att-e2e-6")
    receipt = verifier.create_task(
        args=["task-6", "agent-1", "att-e2e-6", AGENT_PAY]
    ).transact(value=STAKE)  # below 5000
    assert tx_execution_failed(receipt)

    # restore
    receipt = verifier.set_min_stake(args=[0]).transact()
    assert tx_execution_succeeded(receipt)


@pytest.mark.slow
def test_verify_auto_settles_task_atomically(verifier):
    att_id = "att-e2e-7"
    _registered_agent_att(verifier, att_id)

    receipt = verifier.create_task(
        args=["task-7", "agent-1", att_id, AGENT_PAY]
    ).transact(value=STAKE)
    assert tx_execution_succeeded(receipt)

    # Full LLM consensus: this transaction persists verdict AND settles the task
    receipt = verifier.verify_fingerprint(args=[att_id, TRANSCRIPT]).transact()
    assert tx_execution_succeeded(receipt)

    att = verifier.get_attestation(args=[att_id]).call()
    task = verifier.get_task(args=["task-7"]).call()

    assert att["status"] == "VERIFIED"
    expected_status = {
        "MATCH": "RELEASED",
        "MISMATCH": "SLASHED",
        "INCONCLUSIVE": "HELD",
    }[att["verdict"]]
    assert task["status"] == expected_status
    assert task["verdict"] == att["verdict"]
