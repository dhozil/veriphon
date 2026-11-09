"""Direct-mode tests for v0.3: appeal-reversal, ERC-8004 identity, library commitment.

Value-moving escrow reversals are covered on StudioNet (see tests/integration);
direct mode exercises the deterministic state machine and storage layout.
"""

import json
from fixtures import RUBRIC, TRANSCRIPT, sha256_hex, GPT4O_REFERENCE, bound_transcript, valid_judge_payload


def _deploy(direct_deploy):
    c = direct_deploy("contracts/model_fingerprint_verifier.py", RUBRIC)
    c.set_reference_fingerprint("gpt-4o", GPT4O_REFERENCE)
    return c


def _make_inconclusive(c, direct_vm, att_id="att-1"):
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    c.request_attestation(att_id, "agent-1")
    challenge = c.get_challenge(att_id)
    bound = bound_transcript(TRANSCRIPT, challenge["challenge_nonce"], challenge["endpoint_commitment_hash"])
    c.submit_transcript(att_id, bound, sha256_hex(bound))
    # Critical probes pass; advisory P3/P4 false -> score 50 < min_match 75 -> INCONCLUSIVE
    direct_vm.mock_llm(r"model-fingerprinting judge", json.dumps(valid_judge_payload([True, True, False, False])))
    verdict = c.verify_fingerprint(att_id, bound)
    assert verdict == "INCONCLUSIVE"


def test_fingerprint_library_versioning(direct_deploy):
    c = _deploy(direct_deploy)
    lib = c.get_fingerprint_library()
    assert lib["version"] == 0
    assert lib["hash"] == ""

    v = c.set_fingerprint_library("abc123")
    assert v == 1
    lib = c.get_fingerprint_library()
    assert lib["version"] == 1
    assert lib["hash"] == "abc123"

    v = c.set_fingerprint_library("def456")
    assert v == 2
    assert c.get_fingerprint_library()["hash"] == "def456"


def test_fingerprint_library_empty_hash_reverts(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    with direct_vm.expect_revert("library_hash is required"):
        c.set_fingerprint_library("")


def test_agent_identity_roundtrip(direct_deploy):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")

    ident = c.get_agent_identity("agent-1")
    assert ident["bound"] is False
    assert ident["uri"] == ""
    assert ident["default_registry"] != ""  # falls back to owner by default

    c.set_agent_identity("agent-1", "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "42", "ipfs://agent-reg.json")
    ident = c.get_agent_identity("agent-1")
    assert ident["bound"] is True
    assert ident["registry"] == "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
    assert ident["token_id"] == "42"
    assert ident["uri"] == "ipfs://agent-reg.json"


def test_set_agent_identity_unknown_agent_reverts(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    with direct_vm.expect_revert("Agent not found"):
        c.set_agent_identity("nope", "0x8004", "1", "ipfs://x")


def test_set_agent_identity_missing_fields_reverts(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    with direct_vm.expect_revert("registry and token_id are required"):
        c.set_agent_identity("agent-1", "", "42", "ipfs://x")


def test_set_identity_registry(direct_deploy):
    c = _deploy(direct_deploy)
    c.set_identity_registry("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432")
    ident = c.get_agent_identity("agent-1")
    assert ident["default_registry"] == "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"


def test_appeal_rejected_without_inconclusive(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    c.register_agent("agent-1", "gpt-4o", "2024-11-20", "endpoint-hash-1")
    c.request_attestation("att-1", "agent-1")
    # Attestation has no verdict and no HELD task -> appeal must revert
    with direct_vm.expect_revert("Appeals are only for INCONCLUSIVE"):
        c.appeal_verdict("att-1", "please re-review")


def test_appeal_inconclusive_then_resolve_match(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    _make_inconclusive(c, direct_vm, "att-1")

    c.set_appeal_fee(0)  # direct mode cannot inject gl.message.value
    res = c.appeal_verdict("att-1", "score was unlucky on advisory bits")
    assert res == "APPEAL_OPEN"

    appeal = c.get_appeal("att-1")
    assert appeal["found"] is True
    assert appeal["status"] == "OPEN"
    assert appeal["ruling"] == ""
    assert appeal["appellant"] != ""

    ruling = c.resolve_appeal("att-1", "MATCH", "re-reviewed, advisory disagreement tolerated")
    assert ruling == "MATCH"

    appeal = c.get_appeal("att-1")
    assert appeal["status"] == "RESOLVED"
    assert appeal["ruling"] == "MATCH"

    att = c.get_attestation("att-1")
    assert att["verdict"] == "MATCH"

    # Double resolve reverts
    with direct_vm.expect_revert("Appeal already resolved"):
        c.resolve_appeal("att-1", "MISMATCH", "again")

    # Duplicate appeal reverts
    with direct_vm.expect_revert("Appeal already exists"):
        c.appeal_verdict("att-1", "second appeal")


def test_appeal_resolve_inconclusive_keeps_inconclusive(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    _make_inconclusive(c, direct_vm, "att-1")

    c.set_appeal_fee(0)
    c.appeal_verdict("att-1", "please re-review")
    ruling = c.resolve_appeal("att-1", "INCONCLUSIVE", "still ambiguous")
    assert ruling == "INCONCLUSIVE"

    att = c.get_attestation("att-1")
    assert att["verdict"] == "INCONCLUSIVE"


def test_resolve_appeal_unknown_ruling_reverts(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    _make_inconclusive(c, direct_vm, "att-1")

    c.set_appeal_fee(0)
    c.appeal_verdict("att-1", "please re-review")
    with direct_vm.expect_revert("Unknown ruling"):
        c.resolve_appeal("att-1", "MAYBE", "not a verdict")


def test_appeal_bond_too_low_reverts(direct_deploy, direct_vm):
    c = _deploy(direct_deploy)
    _make_inconclusive(c, direct_vm, "att-1")

    c.set_appeal_fee(1000)  # direct mode sends value 0 -> must revert
    with direct_vm.expect_revert("Appeal bond too low"):
        c.appeal_verdict("att-1", "cheap appeal attempt")


def test_get_appeal_not_found(direct_deploy):
    c = _deploy(direct_deploy)
    appeal = c.get_appeal("nope")
    assert appeal["found"] is False
    assert appeal["status"] == ""
