# Veriphon — Vision

**Product name:** Veriphon — *the truth layer for agentic commerce*
**Category:** Agentic Commerce Infrastructure
**Core question:** *Prove which model an agent is actually running.*

## Vision

Every agent-to-agent transaction can be verified: which model is *actually* running — not merely which model is *claimed*. In the coming agentic commerce ecosystem, people will not trust an agent's marketing label. They will trust on-chain evidence anyone can check.

## Mission

1. Build the **trust layer** for agent-to-agent commerce.
2. Prevent **model substitution** and false capability claims.
3. Turn model verification from a subjective, centralized exercise into a **decentralized consensus on GenLayer** that is neutral and re-auditable.
4. Bridge **Identity (ERC-8004) + Payment (x402) + Escrow** — specifically for **adjudication**: proving that an agent's capability claims hold.

## What does "model" mean in this project?

There are two distinct meanings of "model" here, and they must not be conflated:

1. **The AI model / LLM an agent claims to run** — e.g. an agent claiming to run premium GPT-4o or Claude Sonnet. This project tests that claim black-box (input/output), not by disassembling the weights.
2. **The system model (the project's architecture)** — how we prove it: claim registry, versioned probe bank, off-chain transcript collector, and the GenLayer contract for verdict consensus.

What is verified is the LLM's **behavioral identity** (its behavioral fingerprint), not its internal files. Every model family has characteristic traits: style/format, knowledge & reasoning, instruction following, refusal patterns & multilingual behavior, and consistency.

## What is in this project?

### 1. Model Registry (on-chain, GenLayer)
Agents register `agent_id, claimed_model, model_version, endpoint_commitment_hash`. The claim is frozen and hash-bound (SHA-256 fingerprint, the `auction-settlement-judge` pattern) and fail-closed: any hash mismatch makes the `is_verified` gate return false.

### 2. Probe Bank (versioned, on-chain)
The bank of test probes + rubric, versioned and hash-bound. Probes elicit each model family's characteristic traits; each probe is scored as a boolean bit `consistent_with_claimed_model`. The rubric may never be deleted — only versioned (the `genlayer-rubric` pattern).

### 3. Transcript Collector (off-chain)
The backend that actually calls the agent API (with private API keys), producing a `prompt -> response` transcript. API keys **never** go on-chain. The contract only accepts a summarized transcript + its `transcript_hash` from the backend.

### 4. GenLayer Verifier Contract (on-chain)
The heart of the GenLayer side. Independent validators analyze the same transcript and must agree via the **Equivalence Principle**. The result is not a free-form opinion, but a **fixed-length bit vector**: critical bits must match exactly, advisory bits tolerate ±1. PASS/FAIL is derived deterministically in Python — the model never gets a final vote.

### 5. Verdict & Economic Effects
Verdicts are 3-state: `MATCH / MISMATCH / INCONCLUSIVE`.
This is the verdict that opens/closes escrow, reputation, or access to premium marketplaces.

## Goals / Targets

- **Technical:** verdicts can be reproduced by other validators from the same evidence — not dependent on one server.
- **Trust:** counterparties get a fail-closed gate `is_verified(agent_id, model)`. When in doubt, it doesn't pass.
- **Economics:** escrow/stakes can be slashed on MISMATCH; agent reputation is bound to evidence, not claims.
- **Ecosystem:** become a reusable primitive for marketplaces, DAOs, and other agents.

## Honest limits

This project cannot cryptographically prove that the weights are 100% model X — GenLayer only sees black-box behavior.

What is guaranteed is: **behavioral evidence of consistency/inconsistency with the claim, decided by transparent validator consensus.** That is why the verdict includes `INCONCLUSIVE`, rather than a blind binary judge.

The bottom line: not a lie detector, but a **neutral court for model claims**.

## References

- GenLayer documentation: https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
- `genlayer-rubric` (bit-vector consensus): https://github.com/0xyuura/genlayer-rubric
- `auction-settlement-judge` (fingerprint hash, fail-closed): https://github.com/madgoddev/auction-settlement-judge
- `genlayer-task-verifier` (multi-validator AI verify): https://github.com/Frankznation/genlayer-task-verifier
- `Consensus` (escrow + adjudication): https://github.com/Chinny070/consensus

## Related documents

- `BLUEPRINT.md` — full technical blueprint (currently available in Indonesian)
- `README.md` — contract API, deployment record, verification commands
- `deployments.json` — StudioNet deployment history
