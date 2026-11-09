import json

from fixtures import RUBRIC, TRANSCRIPT, sha256_hex, GPT4O_REFERENCE, bound_transcript, valid_judge_payload


def _deploy(direct_deploy):
    c = direct_deploy("contracts/model_fingerprint_verifier.py", RUBRIC)
    c.set_reference_fingerprint("gpt-4o", GPT4O_REFERENCE)
    return c


def _submit_bound(c, att_id="att-1", transcript=TRANSCRIPT):
    challenge = c.get_challenge(att_id)
    bound = bound_transcript(
        transcript,
        challenge["challenge_nonce"],
        challenge["endpoint_commitment_hash"],
    )
    c.submit_transcript(att_id, bound, sha256_hex(bound))
    return bound


def test_deploy_and_probe_bank(direct_deploy):
    c = _deploy(direct_deploy)
    bank = c.get_probe_bank()
    assert bank["version"] == 1
    assert bank["rubric_hash"] == sha256_hex(RUBRIC)
    assert bank["advisory_tolerance"] == 1


def test_register_agent_and_get(direct_deploy):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    a = c.get_agent("agent-1")
    assert a["claimed_model"] == "gpt-4o"
    assert a["reputation"] == 0


def test_register_agent_duplicate_reverts(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    with direct_vm.expect_revert("Agent already registered"):
        c.register_agent("agent-1", "claude-sonnet", "2025-01-01", "endpoint-hash-2")


def test_attestation_lifecycle_and_verify_match(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    c.request_attestation("att-1", "agent-1")

    att = c.get_attestation("att-1")
    assert att["status"] == "PENDING"
    assert att["agent_id"] == "agent-1"

    bound = _submit_bound(c)
    att = c.get_attestation("att-1")
    assert att["status"] == "SUBMITTED"

    # LLM judge returns all-true bits -> MATCH (critical 0 violations, score 100)
    direct_vm.mock_llm(r"model-fingerprinting judge", json.dumps(valid_judge_payload([True, True, True, True])))

    verdict = c.verify_fingerprint("att-1", bound)
    assert verdict == "MATCH"

    att = c.get_attestation("att-1")
    assert att["status"] == "VERIFIED"
    assert att["verdict"] == "MATCH"
    assert att["match_score"] == 100

    # Validator must agree: rerun via captured validator -> True
    assert direct_vm.run_validator() is True

    # Fail-closed gate
    assert c.is_verified("agent-1", "gpt-4o") is True
    assert c.is_verified("agent-1", "claude-sonnet") is False
    assert c.is_verified("unknown", "gpt-4o") is False


def test_verify_mismatch_on_critical_failure(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    c.request_attestation("att-1", "agent-1")
    bound = _submit_bound(c)

    # P1 (critical) false -> MISMATCH even though others true
    direct_vm.mock_llm(r"model-fingerprinting judge", json.dumps(valid_judge_payload([False, True, True, True])))

    verdict = c.verify_fingerprint("att-1", bound)
    assert verdict == "MISMATCH"

    att = c.get_attestation("att-1")
    assert att["match_score"] == 75
    assert c.is_verified("agent-1", "gpt-4o") is False


def test_hash_mismatch_reverts(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    c.request_attestation("att-1", "agent-1")
    challenge = c.get_challenge("att-1")
    bound = bound_transcript(TRANSCRIPT, challenge["challenge_nonce"], challenge["endpoint_commitment_hash"])
    with direct_vm.expect_revert("Transcript hash mismatch"):
        c.submit_transcript("att-1", bound, "deadbeef" * 8)


def test_verify_before_submit_reverts(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    c.request_attestation("att-1", "agent-1")
    with direct_vm.expect_revert("No transcript submitted"):
        c.verify_fingerprint("att-1", TRANSCRIPT)


def test_validator_tolerance_advisory_bit(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    c.request_attestation("att-1", "agent-1")
    bound = _submit_bound(c)

    # Leader: all true. Validator sees advisory P3=false -> diff=1 <= tolerance 1 -> agree.
    # In direct mode the mock is re-matched on validator rerun, so both calls
    # return the same value; to test the tolerance path we assert the captured
    # validator accepts a leader result that differs by one advisory bit.
    direct_vm.mock_llm(r"model-fingerprinting judge", json.dumps(valid_judge_payload([True, True, True, True])))

    verdict = c.verify_fingerprint("att-1", bound)
    assert verdict == "MATCH"

    # Simulate leader proposing advisory-diff bit vector, validator reruns
    # same mock (all-true). Advisory diff = 1 -> validator should accept.
    assert direct_vm.run_validator(leader_result={
        "bits": [True, True, False, True],
        "verdict": "MATCH",
        "match_score": 75,
        "critical_violations": 0,
        "advisory_violations": 1,
        "evidence_hash": "x",
        "evidence": valid_judge_payload([True, True, False, True])["evidence"],
        "confidence": "high",
    }) is True

    # Critical diff -> validator must reject.
    assert direct_vm.run_validator(leader_result={
        "bits": [False, True, True, True],
        "verdict": "MISMATCH",
        "match_score": 75,
        "critical_violations": 1,
        "advisory_violations": 0,
        "evidence_hash": "x",
        "evidence": valid_judge_payload([False, True, True, True])["evidence"],
        "confidence": "high",
    }) is False
