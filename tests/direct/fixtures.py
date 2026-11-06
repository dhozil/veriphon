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
