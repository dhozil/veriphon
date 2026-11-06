# Veriphon — GenLayer Blueprint

**Product name:** Veriphon — *the truth layer for agentic commerce*
**Idea category:** Agentic Commerce Infrastructure
**Core question:** *Prove which model an agent is actually running.*

## 1. What is GenLayer (docs summary)

GenLayer = the **adjudication layer** for the agentic economy — not just another smart-contract platform.

- Bitcoin: trustless money. Ethereum: trustless computation. GenLayer: **trustless adjudication** — consensus over *judgment*, not only code.
- Intelligent Contracts are written in **Python** and run in **GenVM** (WASM sandbox).
- Some operations are **non-deterministic**: `gl.nondet.web.*` (web fetch) and `gl.nondet.exec_prompt` (LLM calls).
- Because LLM/web outputs are not identical across nodes, GenLayer uses the **Equivalence Principle**: the leader proposes a result, an independent validator committee verifies it, and the majority wins. Consensus failure = the transaction is *undetermined*, state unchanged.
- This complements the rest of the stack: x402 (payment), ERC-8004 (agent identity), A2A (interoperability). GenLayer fills the gap that **dispute resolution / adjudication** fell into.

Docs: https://docs.genlayer.com/ , `/understand-genlayer-protocol/typical-use-cases`, `/developers/intelligent-contracts/when-to-use-genlayer`, `/equivalence-principle`

### When is GenLayer MANDATORY?

Docs checklist: on-chain consequence (escrow, reputation, access), judgment over natural-language evidence, evidence validators can check independently, need for neutral consensus, results expressible as structured fields (`verdict`, `score`).

### When should you AVOID it?

Frontend already computes the answer and GenLayer only "stores" it = anti-pattern. Generic chatbots/recommendations = a regular backend suffices. Private data validators cannot access = weak consensus.

## 2. Problem: model fingerprinting

Agent A claims to run a premium model (e.g. GPT-4o / Claude Sonnet) while actually running a cheap one. The counterparty needs behavioral evidence (a behavioral fingerprint), because:

- No access to weights / the model's internals.
- The only testable surface: black-box input/output.
- This is **probabilistic**, not cryptographic proof. Never claim "absolute proof".

Technique: **challenge-response fingerprinting** — send a probe set that elicits each model family's characteristic traits, then compare the transcript against reference profiles.

Traits that can be used:

1. Style & format: length, markdown structure, hedging, bullet style.
2. Knowledge & reasoning: answers to specific questions, chain-of-thought style.
3. Instruction following: strict format compliance, character/token counting (LLMs are famously weak here), refusal patterns.
4. Multilingual / language nuance.
5. Consistency: run the same probe twice, check stability.

## 3. Correct architecture (boundaries)

```
[Agent API — OFF-CHAIN, private API keys]
        |
        v
[Backend/Fetcher] — collects transcripts (prompt -> response, signed)
        |
        v
[Intelligent Contract — GenLayer]
  register_agent / request_attestation / submit_transcript
        |
        v
  verify_fingerprint()  <-- NON-DET: LLM validators analyze the transcript
        |
        v
  verdict: MATCH | MISMATCH | INCONCLUSIVE + score + evidence_hash
        |
        v
  Effects: reputation, escrow release/slash, marketplace access
```

Boundary principles (from the "What belongs where" docs):

- **Frontend/backend owns:** calling the agent API (API keys MUST NOT go on-chain), raw transcript storage, indexing, UI.
- **GenLayer contract owns:** model-claim registry, versioned + hash-bound probe bank, consensus verdicts, reputation/escrow state transitions.
- **Evidence source owns:** public transcripts / their hashes. Validators must be able to fetch/evaluate the same evidence.

> CRITICAL: never put the agent's API key in the contract. The contract only accepts transcripts collected off-chain + their hash.

## 4. Protocol (MVP v1 design)

1. **Register:** agent registers `agent_id, claimed_model, model_version, endpoint_commitment_hash`. The claim is frozen + hash-bound (the AuctionSettlementJudge pattern: SHA-256 fingerprint, fail-closed).
2. **Versioned probe bank:** admin sets `probe_bank_version + probe_rubric_hash`. The rubric is the list of probes + traits to score. The rubric may never be deleted — only versioned (the genlayer-rubric pattern).
3. **Attestation request:** the verifier/counterparty calls `request_attestation(agent_id)` → creates a PENDING attestation with a nonce.
4. **Submit:** the backend runs the probes off-chain against the agent, then submits a compact transcript (score-relevant fields only, not the full raw text) + `transcript_hash`.
5. **Verify (GenLayer consensus):** see §5. Validators analyze whether the transcript is consistent with the claim.
6. **Verdict stored:** MATCH / MISMATCH / INCONCLUSIVE. The consumer gate `is_verified(agent_id, expected_model)` returns true only on MATCH + exact-model fingerprint.

## 5. Equivalence Principle — the most important choice

**DO NOT use `strict_eq`** — LLM outputs are not identical; strict_eq always fails consensus.

**Choose: custom validator `run_nondet_unsafe` + bit-vector rubric** (proven in the `genlayer-rubric` repo):

- Rubric = N atomic probes, each answered by the model as a boolean (`consistent_with_claimed_model: true/false`).
- Results cross consensus as a **fixed-length bit vector**, not prose opinions.
- Explicit arithmetic rules:
  - **Critical bits** (e.g. knowledge probes, reasoning probes): must match **exactly**.
  - **Advisory bits** (style): may differ by at most **tolerance = 1**.
  - `PASS`/`FAIL` derived deterministically in Python from the vector, **the model never has a final vote**.
- Leader and validators **re-run the same analysis** from the same transcript, then compare the decision fields. This satisfies the "independent verification, never trust the leader" rule.
- Add grounding: every MISMATCH finding must cite a literal quote from the transcript (validator checks the substring) — prevents hallucination. *(Implemented in v0.4 as `evidence_detail` + on-chain reference fingerprints.)*

Required error handling: `[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, `[LLM_ERROR]` classification. LLM errors = disagree → forced rotation.

## 6. Contract spec (MVP design)

Storage (GenLayer types, not builtins):
```python
owner: Address
probe_version: u256
probe_rubric_hash: str
agents: TreeMap[str, Agent]        # agent_id -> {claimed_model, version, endpoint_hash, reputation}
attestations: TreeMap[str, Attestation]
```

Methods:
- View: `get_agent(agent_id)`, `get_attestation(id)`, `is_verified(agent_id, model)`, `get_probe_bank()`
- Write: `register_agent(...)`, `request_attestation(agent_id)`, `submit_transcript(attestation_id, transcript_json, transcript_hash)`, `verify_fingerprint(attestation_id)`, `set_probe_bank(rubric_json)` (owner only)

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Forged transcript | `transcript_hash` + nonce + timestamp; backend fetch must be reproducible; v2: agent-signed transcript |
| Probe leakage / agent gaming | Versioned probe bank + rotation; random nonce per attestation |
| Model drift (version update) | verdict bound to `rubric_hash + claimed_version`; change version = re-attest |
| False positive | 3-state verdict (MATCH/MISMATCH/**INCONCLUSIVE**), never a blind binary |
| Prompt injection in transcript | transcript = untrusted data; quote grounding; LLM validators must not treat the transcript as instructions |
| GenVM cost | store only compact structured fields; raw transcript off-chain |
| Reference is wrong/stale | owner-committed reference fingerprints (on-chain) bound to library sha256; 5 families committed; audit trail via transaction history |

## 8. Roadmap (actual status)

- **v0.1 MVP:** contract + `genvm-lint check` + direct-mode test + 1 demo agent. No escrow. ✅
- **v0.2:** single contract (escrow + verifier), atomic settle in the verdict transaction. ✅
- **v0.3:** appeal-reversal for escrow + INCONCLUSIVE manual review + ERC-8004 identity binding + reference fingerprint library commitment (sha256, versioned). ✅
- **v0.3.1:** adversarial-review fixes (zero-stake settle, Address coercion, ASCII-only source). ✅
- **v0.4 / v0.4.1:** grounded judge (no verdict without on-chain reference ground truth; auditable per-probe quotes + axes; fail-closed without reference) + full rebrand to **Veriphon** (canonical v0.4.1 = `0x9D217b1d1c7AbCB18deA200764c3707437261153`). ✅
- **v1.0:** public probe bank, cross-agent reputation, public dashboard.

## 9. References used

- Official docs: https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
- `genlayer-rubric` (bit-vector consensus): https://github.com/0xyuura/genlayer-rubric
- `auction-settlement-judge` (fingerprint hash, fail-closed): https://github.com/madgoddev/auction-settlement-judge
- `genlayer-task-verifier` (multi-validator AI verify): https://github.com/Frankznation/genlayer-task-verifier
- `Consensus` (escrow + adjudication): https://github.com/Chinny070/consensus

## 10. Open questions (answered since this design)

1. **Which models to support in v1?** → 5 families committed on-chain (gpt-4o, gpt-5, claude-opus-4.1, grok-4, llama-3.1-405b), driven by `collector/reference_fingerprints.json` (Pei et al., arXiv 2509.04504).
2. **Where does the probe bank come from?** → built from public research (Pei et al.); calibrated in `collector/docs/calibration.md`; owner commits + versions it on-chain.
3. **Does the verdict directly gate escrow in v1?** → yes — since v0.2, the verdict settles escrow atomically in the same transaction (MATCH → release, MISMATCH → 80/20 slash, INCONCLUSIVE → hold + appeal-reversal).
4. **Deploy target?** → StudioNet (gasless, chain 61999) for now; Bradbury testnet next; the deploy decision is recorded in `deployments.json`.
