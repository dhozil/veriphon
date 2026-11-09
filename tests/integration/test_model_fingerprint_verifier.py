"""Integration test: real GenVM + real validator consensus on StudioNet (gasless).

Run:
    gltest tests/integration/ -v -s --network studionet

verify_fingerprint() runs LLM consensus (leader + N validators), so the
@pytest.mark.slow tests take ~30-90s each and consume real inference.
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


def test_probe_bank_is_set(verifier):
    bank = verifier.get_probe_bank(args=[]).call()
    assert bank["version"] == 1
    assert bank["rubric_hash"] == sha256_hex(RUBRIC)


def test_register_agent_and_get(verifier):
    receipt = verifier.register_agent(
        args=["agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1"]
    ).transact()
    assert tx_execution_succeeded(receipt)

    a = verifier.get_agent(args=["agent-1"]).call()
    assert a["claimed_model"] == "gpt-4o"
    assert a["reputation"] == 0


def test_register_agent_duplicate_fails(verifier):
    receipt = verifier.register_agent(
        args=["agent-1", "claude-sonnet", "2025-01-01", "endpoint-hash-2"]
    ).transact()
    assert tx_execution_failed(receipt)


@pytest.mark.slow
def test_attestation_lifecycle_and_verify(verifier):
    receipt = verifier.request_attestation(args=["att-1", "agent-1"]).transact()
    assert tx_execution_succeeded(receipt)

    att = verifier.get_attestation(args=["att-1"]).call()
    assert att["status"] == "PENDING"

    challenge = verifier.get_challenge(args=["att-1"]).call()
    bound = bound_transcript(
        TRANSCRIPT,
        challenge["challenge_nonce"],
        challenge["endpoint_commitment_hash"],
    )
    receipt = verifier.submit_transcript(
        args=["att-1", bound, sha256_hex(bound)]
    ).transact()
    assert tx_execution_succeeded(receipt)

    att = verifier.get_attestation(args=["att-1"]).call()
    assert att["status"] == "SUBMITTED"

    # Real LLM consensus: validators judge whether transcript is consistent.
    receipt = verifier.verify_fingerprint(args=["att-1", bound]).transact()
    assert tx_execution_succeeded(receipt)

    att = verifier.get_attestation(args=["att-1"]).call()
    assert att["status"] == "VERIFIED"
    assert att["verdict"] in ("MATCH", "MISMATCH", "INCONCLUSIVE")
    assert 0 <= att["match_score"] <= 100

    # Fail-closed gate: true only on MATCH + exact model
    verified = verifier.is_verified(args=["agent-1", "gpt-4o"]).call()
    assert verified is (att["verdict"] == "MATCH")
    assert verifier.is_verified(args=["agent-1", "claude-sonnet"]).call() is False


def test_hash_mismatch_fails(verifier):
    receipt = verifier.request_attestation(args=["att-2", "agent-1"]).transact()
    assert tx_execution_succeeded(receipt)

    receipt = verifier.submit_transcript(args=["att-2", TRANSCRIPT, "deadbeef" * 8]).transact()
    assert tx_execution_failed(receipt)


def test_verify_before_submit_fails(verifier):
    receipt = verifier.request_attestation(args=["att-3", "agent-1"]).transact()
    assert tx_execution_succeeded(receipt)

    receipt = verifier.verify_fingerprint(args=["att-3", TRANSCRIPT]).transact()
    assert tx_execution_failed(receipt)


def test_address_was_recorded(verifier):
    """Print the throwaway deploy address (artifacts/ is cleared per run).

    Deliberately does NOT write tracked files - deployments.json is the curated
    canonical deployment record and must not be clobbered by test runs.
    """
    print("\nDEPLOYED_ADDRESS (throwaway, not recorded):", verifier.address)
    assert verifier.address
