"""Adversarial StudioNet tests: source-bound challenge-response rejections.

These tests deploy a throwaway Veriphon contract on StudioNet and exercise
the deterministic binding gates only. No LLM consensus is consumed.

Run:
    gltest tests/integration/test_source_binding_adversarial.py -v -s --network studionet
"""

import json

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_failed, tx_execution_succeeded

from fixtures import RUBRIC, TRANSCRIPT, sha256_hex, GPT4O_REFERENCE, bound_transcript


@pytest.fixture(scope="module")
def verifier():
    v = get_contract_factory("Veriphon").deploy(args=[RUBRIC])
    v.set_reference_fingerprint(args=["gpt-4o", GPT4O_REFERENCE]).transact()
    return v


def _ensure_agent(v):
    try:
        v.get_agent(args=["agent-1"]).call()
        return
    except Exception:
        receipt = v.register_agent(args=["agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1"]).transact()
        assert tx_execution_succeeded(receipt)


def _registered_attestation(v, att_id):
    _ensure_agent(v)
    receipt = v.request_attestation(args=[att_id, "agent-1"]).transact()
    assert tx_execution_succeeded(receipt)
    return v.get_challenge(args=[att_id]).call()


def _print_failed_receipt(label, receipt):
    tx_hash = receipt.get("hash") if isinstance(receipt, dict) else getattr(receipt, "hash", None)
    status = receipt.get("status") if isinstance(receipt, dict) else getattr(receipt, "status", None)
    result = receipt.get("result") if isinstance(receipt, dict) else getattr(receipt, "result", None)
    print(f"\nREJECTED_TX {label}: {tx_hash}; status={status}; result={result}")


def test_unbound_transcript_rejected_on_chain(verifier):
    _registered_attestation(verifier, "att-reject-unbound")
    receipt = verifier.submit_transcript(
        args=["att-reject-unbound", TRANSCRIPT, sha256_hex(TRANSCRIPT)]
    ).transact()
    _print_failed_receipt("unbound_transcript", receipt)
    assert tx_execution_failed(receipt)


def test_wrong_endpoint_transcript_rejected_on_chain(verifier):
    challenge = _registered_attestation(verifier, "att-reject-endpoint")
    wrong_endpoint = bound_transcript(
        TRANSCRIPT,
        challenge["challenge_nonce"],
        "endpoint-hash-999",
    )
    receipt = verifier.submit_transcript(
        args=["att-reject-endpoint", wrong_endpoint, sha256_hex(wrong_endpoint)]
    ).transact()
    _print_failed_receipt("wrong_endpoint_transcript", receipt)
    assert tx_execution_failed(receipt)


def test_replayed_transcript_rejected_on_chain(verifier):
    challenge = _registered_attestation(verifier, "att-reject-replay")
    bound = bound_transcript(
        TRANSCRIPT,
        challenge["challenge_nonce"],
        challenge["endpoint_commitment_hash"],
    )
    receipt = verifier.submit_transcript(
        args=["att-reject-replay", bound, sha256_hex(bound)]
    ).transact()
    assert tx_execution_succeeded(receipt)

    receipt = verifier.request_attestation(args=["att-reject-replay-2", "agent-1"]).transact()
    assert tx_execution_succeeded(receipt)

    receipt = verifier.submit_transcript(
        args=["att-reject-replay-2", bound, sha256_hex(bound)]
    ).transact()
    _print_failed_receipt("replayed_transcript", receipt)
    assert tx_execution_failed(receipt)


def test_challenge_view_matches_attestation_view(verifier):
    challenge = _registered_attestation(verifier, "att-source-bound")
    att = verifier.get_attestation(args=["att-source-bound"]).call()
    assert challenge["challenge_nonce"] == att["challenge_nonce"]
    assert challenge["challenge_hash"] == att["challenge_hash"]
    assert challenge["endpoint_commitment_hash"] == att["endpoint_commitment_hash"]
    assert json.loads(challenge["challenge_probe_ids"]) == ["P1", "P2", "P3", "P4"]
    assert challenge["challenge_status"] == "ISSUED"
