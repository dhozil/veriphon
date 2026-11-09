import hashlib
import json


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


RUBRIC = json.dumps(
    {
        "probes": [
            {"probe_id": "P1", "critical": True, "trait": "reasoning style consistent with claimed model"},
            {"probe_id": "P2", "critical": True, "trait": "knowledge answer matches claimed model family"},
            {"probe_id": "P3", "critical": False, "trait": "formatting / markdown structure consistent"},
            {"probe_id": "P4", "critical": False, "trait": "response length / hedging style consistent"},
        ],
        "min_match_score": 75,
    },
    sort_keys=True,
)

TRANSCRIPT = json.dumps(
    {
        "agent_id": "agent-1",
        "responses": [
            {"probe_id": "P1", "response": "Here is the step-by-step chain of thought..."},
            {"probe_id": "P2", "response": "The correct answer is 42 because..."},
            {"probe_id": "P3", "response": "## Answer\n\n- bullet one\n- bullet two"},
            {"probe_id": "P4", "response": "In brief, the summary is concise and hedging-free."},
        ],
    },
    sort_keys=True,
)

TRANSCRIPT_HASH = sha256_hex(TRANSCRIPT)

# Ground-truth reference fingerprint for gpt-4o (from collector/reference_fingerprints.json,
# Pei et al. arXiv 2509.04504). Owner must store it before verify_fingerprint will judge.
GPT4O_REFERENCE = json.dumps(
    {
        "family": "openai",
        "persona": "ISTJ",
        "axes": {
            "abstract_reasoning": 1.0,
            "causal_chain": 1.0,
            "counterfactual_physics": 0.89,
            "sycophancy_resistance": 0.75,
            "robustness": 0.75,
            "metacognition": 0.67,
        },
        "notes": "Perfect abstract/causal, tempered metacognition and sycophancy. Systematic ISTJ style.",
    },
    sort_keys=True,
)


def bound_transcript(transcript_text, challenge_nonce, endpoint_commitment_hash, agent_id=None):
    """Embed the per-attestation source binding into a transcript payload.

    The contract requires challenge_nonce + endpoint_commitment_hash to be
    part of the hashed transcript itself; replaying this payload against a
    different attestation fails because the challenge nonce changes. Each
    response must also echo the nonce, representing the challenge response.
    """
    data = json.loads(transcript_text)
    if agent_id is not None:
        data["agent_id"] = agent_id
    data["challenge_nonce"] = challenge_nonce
    data["endpoint_commitment_hash"] = endpoint_commitment_hash
    for item in data.get("responses", []):
        response = item.get("response", "")
        if challenge_nonce not in response:
            item["response"] = f"{challenge_nonce}\n{response}" if response else challenge_nonce
    return json.dumps(data, sort_keys=True)


def valid_judge_payload(bits):
    """A grounded judge response: full evidence, verbatim quotes, selected axes."""
    quotes = [
        "Here is the step-by-step chain of thought...",
        "The correct answer is 42 because...",
        "## Answer",
        "hedging-free",
    ]
    axes = ["causal_chain", "abstract_reasoning", None, "sycophancy_resistance"]
    return {
        "bits": bits,
        "evidence": [
            {"probe_id": f"P{i + 1}", "consistent": bits[i], "quote": quotes[i], "axis": axes[i]}
            for i in range(len(bits))
        ],
        "confidence": "high",
    }
