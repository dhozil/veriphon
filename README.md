# Veriphon

**The truth layer for agentic commerce** — *Prove which model an agent is actually running.*

Veriphon is a GenLayer Intelligent Contract for **model fingerprint verification**: black-box verification of whether an agent actually runs the model it claims to run, via validator consensus over behavioral fingerprints.

- Vision & mission: `VISION.md`
- Technical blueprint: `BLUEPRINT.md`
- Product name: **Veriphon**

## Architecture

```
[Agent API — OFF-CHAIN, private API keys]
        ↓
[Backend / Transcript Collector] — collects prompt→response transcripts
        ↓
[Veriphon — GenLayer, single contract] — registry + probe bank + consensus verdicts + escrow
        ↓
  verdict: MATCH | MISMATCH | INCONCLUSIVE (+ score + evidence_hash)
        ↓
  In the SAME transaction: atomic escrow settlement (release / slash / hold) + reputation + marketplace access
```

Boundary principles (GenLayer docs, "What belongs where"):

- **Frontend/backend owns:** calling the agent API (API keys must never be on-chain), raw transcript storage, indexing, UI.
- **GenLayer contract owns:** model-claim registry, versioned + hash-bound probe bank, consensus verdicts, reputation/escrow state transitions.
- **Evidence source owns:** public transcript + its hash. Validators must be able to evaluate the same evidence.

## Equivalence Principle (in use)

**Not `strict_eq`** — LLM outputs are not byte-identical across nodes.

Used: **custom validator `run_nondet_unsafe` + bit-vector rubric** (the `genlayer-rubric` pattern):

- Rubric = N atomic probes → each probe answered as a boolean (`consistent_with_claimed_model`).
- The result crosses consensus as a **fixed-length bit vector**, not free-form prose.
- **Critical bits** (knowledge/reasoning): must match **exactly**.
- **Advisory bits** (style/format): may differ by ≤ `advisory_tolerance` (default 1).
- **PASS/FAIL derived deterministically in Python** from the vector — the model never votes.
- Leader and validators **re-run the same independent analysis** from the same transcript → independent verification, never trust the leader.
- Verdict is 3-state: `MATCH` (no critical violations, score ≥ threshold), `MISMATCH` (critical violation), `INCONCLUSIVE` (no critical violation but low score).

All errors are classified: `[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, `[LLM_ERROR]`. LLM errors → disagree → forced rotation.

## Contract

`contracts/model_fingerprint_verifier.py` — **single contract** (v0.4, escrow + verifier + appeal-reversal + **grounded judge**; no cross-contract emits):

| Method | Type | Description |
|---|---|---|
| `get_probe_bank()` | view | version + rubric hash + json + tolerance |
| `get_agent(agent_id)` | view | model claim + reputation |
| `get_attestation(attestation_id)` | view | status + verdict + score + **evidence_detail** (auditable per-probe rationale) |
| `is_verified(agent_id, expected_model)` | view | fail-closed gate (MATCH + current rubric + exact model) |
| `get_task(task_id)` | view | escrow status + stake + verdict |
| `get_balance_info()` | view | contract balance, total_locked, min_stake, pool, appeal_fee, library |
| `get_agent_identity(agent_id)` | view | ERC-8004 binding (registry, token_id, uri) or default registry |
| `get_fingerprint_library()` | view | version + sha256 commitment of the off-chain reference library per model family |
| `get_reference_fingerprint(model_key)` | view | stored ground truth: the fingerprint JSON the judge is bound to |
| `get_appeal(attestation_id)` | view | appeal OPEN/RESOLVED + bond + ruling |
| `register_agent(...)` | write | register a model claim (anti-duplicate) |
| `set_probe_bank(rubric_json, tolerance)` | write | owner-only, version+1, hash-bound |
| `set_min_stake(n)` | write | owner-only |
| `set_pool(addr)` | write | owner-only, slash pool recipient |
| `set_appeal_fee(n)` | write | owner-only, minimum appeal bond (default 1000 raw units) |
| `set_identity_registry(addr)` | write | owner-only, default (informational) ERC-8004 registry |
| `set_agent_identity(agent_id, registry, token_id, uri)` | write | owner-only, bind an ERC-8004 identity to a registered agent |
| `set_fingerprint_library(hash)` | write | owner-only, version+1, sha256 commitment of the off-chain library |
| `set_reference_fingerprint(model_key, fingerprint_json)` | write | owner-only, store per-model ground truth (anti-hallucination) |
| `request_attestation(...)` | write | create an attestation in PENDING |
| `submit_transcript(...)` | write | submit transcript + verify SHA-256 hash (deterministic gate) |
| `create_task(task_id, agent_id, attestation_id, agent_payout)` | write **payable** | buyer locks stake ≥ min_stake; binds task → attestation |
| `settle_task(task_id, verdict)` | write | owner-only manual settlement (including HELD tasks, incl. INCONCLUSIVE) |
| `verify_fingerprint(...)` | write | LLM consensus → verdict → reputation → **atomic escrow settle** |
| `appeal_verdict(attestation_id, reason)` | write **payable** | open an appeal for an INCONCLUSIVE verdict (or a HELD task); bond ≥ appeal_fee |
| `resolve_appeal(attestation_id, ruling, note)` | write | owner-only adjudication; settles bound FUNDED/HELD tasks + refunds/forfeits bond |

Appeal-reversal (v0.3): MATCH/MISMATCH verdicts are final (atomic settlement in the same transaction — value has already moved, it cannot be clawed back). INCONCLUSIVE is not final: an appellant calls `appeal_verdict` (bond ≥ appeal_fee) → the owner adjudicates via `resolve_appeal` → bound FUNDED/HELD tasks are re-settled with the ruling. Bond: decisive ruling (MATCH/MISMATCH) → bond refunded to appellant; ruling remains INCONCLUSIVE → bond forfeited to the pool (anti frivolous-appeal). This also fixed the v0.2 flaw where `settle_task` refused HELD tasks, making INCONCLUSIVE funds unreachable.

Escrow flow: `create_task` (payable) → `verify_fingerprint` → verdict finalized → **same transaction** settles the task:
`MATCH` → full stake to `agent_payout`; `MISMATCH` → 80% buyer, 20% pool; `INCONCLUSIVE` → funds locked (owner resolves manually via `settle_task`).

EOA payouts use `@gl.evm.contract_interface` + `emit_transfer(value=..., on="finalized")` (verified on StudioNet). **Not** `gl.get_contract_at().emit_transfer()` / not `gl.chain.Account` — the internal IC-to-IC path silently loses value to an EOA (child transaction never activates), and `gl.chain` does not exist in this runner (`AttributeError: module 'genlayer.gl' has no attribute 'chain'`).

E2E escrow test: `tests/integration/test_escrow_e2e.py` (7 tests, StudioNet + real LLM consensus for the atomic path).

## Grounding the AI — why the verdict can be trusted (anti-hallucination)

The verdict is not taken from the LLM's "feeling". The decision path is grounded end to end:

1. **Bound claim** — `register_agent` freezes the model + version claim; `is_verified` is fail-closed on any non-exact model.
2. **Hash gate** — the transcript must hash correctly (deterministic); anything off-hash is rejected.
3. **On-chain ground truth** — `set_reference_fingerprint` stores per-model reference fingerprints (measured axes + persona; source: Pei et al., *Behavioral Fingerprinting of LLMs*, arXiv 2509.04504). **Without ground truth, `verify_fingerprint` reverts** — the AI may not guess from its own parametric memory.
4. **Bound prompt** — the judge is instructed: use only S1 (reference + library hash) & S2 (transcript); every probe must cite a named axis (e.g. `causal_chain`) + a **verbatim quote** (max 140 chars) as evidence. Quotes may not be invented; an axis not present in the reference is automatically *dropped* by the on-chain sanitizer.
5. **Consensus on bits, not prose** — validators challenge bits via rubric tolerance (critical exact, advisory ±tolerance); "reasoning" is never the object of consensus.
6. **Auditable rationale** — `evidence_detail` (`{confidence, evidence[]}`) is stored on-chain and shown in the Verify UI; entries the AI invents (axis outside the reference) are dropped before being stored.
7. **Fully fail-closed** — missing reference, hash mismatch, claim mismatch, stale rubric → no valid verdict.

What remains honest: "consistent with reference" is behavioral evidence against the reference — not cryptographic proof of weights. INCONCLUSIVE exists for genuine uncertainty; appeal-reversal is the recovery path.

## Deployment (StudioNet, gasless)

Deployed via the gltest integration fixture (`get_contract_factory("Veriphon").deploy(args=[RUBRIC])`):

- **Address (v0.4.1, VERIPHON rebrand + GROUNDED JUDGE, LIVE, LATEST):** `0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F` — the frontend points here. Deployed via `scripts/deploy_v04.py` (tx `0xeb8d…`); library **version 1** `ea24f643351ed707c0d555abba1f750ecd06519a07857c52237543c3668fdbd2` (tx `0xad29…`); reference fingerprints for 5 models loaded (gpt-4o, gpt-5, claude-opus-4.1, grok-4, llama-3.1-405b). v0.4 `0xaB03…`, v0.3.1 `0x1b10…`, v0.3 `0xC4AA…`, v0.2 `0xF8D1…` — all superseded.
- **Network:** studionet (chain 61999, https://studio.genlayer.com/api)
- **Deployer:** `0x3958a649b41cd7c8561f4233cc0f5b0469bc98e0` (wallet `D:\Genlayer-project\wallet`, `GENLAYER_DEV_KEY`)
- **Rubric hash:** `d5430cc94275bd69bb9f9acbca41d9dd2eec7c9a895425c4d1ae48524f5ec55f`
- **Reference library sha256:** `ea24f643351ed707c0d555abba1f750ecd06519a07857c52237543c3668fdbd2` (`collector/reference_fingerprints.json`)
- **Contract source must be pure ASCII** — the StudioNet schema service (`get_contract_schema_for_code`) encodes the request as ASCII; a single em-dash fails schema extraction completely (`UnicodeEncodeError: 'ascii' codec can't encode character '\u2014'`).
- **Explorer:** https://explorer-studio.genlayer.com/

## Integration status (StudioNet)

- **`tests/integration/test_model_fingerprint_verifier.py`** — **7/7 passed (156.36s)**, re-run with the grounded judge (real validator LLM consensus): deploy, probe bank, register (+dup), full attestation lifecycle + LLM consensus, hash gate, verify-before-submit.
- **`tests/integration/test_escrow_e2e.py`** — **7/7 passed (395.73s)**, re-run with the grounded judge: payable `create_task`, MATCH release, MISMATCH 80/20 slash, INCONCLUSIVE hold, double-settle rejected, min_stake gate, and **atomic LLM auto-settle**.
- **`tests/integration/test_v03_e2e.py`** — **7/7 passed (527.78s)**: appeal→resolve MATCH (task released + bond refunded), appeal→resolve INCONCLUSIVE (task stays HELD + bond to pool), bond too low rejected, double-appeal rejected, double-resolve rejected, manual `settle_task` on HELD task, identity + library commitment roundtrip.
- **On-chain smoke (canonical v0.4.1):** `scripts/smoke_onchain.py` — happy path on `0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F`: register → attest → submit → fund task 1000 → **verify_fingerprint (grounded LLM consensus) → verdict MATCH → task atomically RELEASED**; `is_verified` true; `total_locked` 1000 → 0; on-chain `evidence_detail`: P1 `causal_chain` + verbatim quote, P2/P3 without axes, P4 `sycophancy_resistance` — all quotes verbatim.
- **On-chain smoke (appeal path):** `scripts/smoke_onchain_appeal.py` — deterministic recovery path: `settle_task(INCONCLUSIVE)` → `appeal_verdict` (bond 1000) → `resolve_appeal(MATCH)` → task RELEASED + bond refunded.
- **Demo seed (identity + escrow):** `scripts/seed_identity_and_task.py` — binds ERC-8004 identity for `agent-1` (registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, token 1, uri `ipfs://veriphon-agent-1`) and sets the default registry; creates escrow task `task-1` (1000 stake, bound to att-1) which stays FUNDED so the `/escrow` lookup displays live state; all cards (identity, rationale, gate, balance) render fully on the frontend.
- **Direct (mocked LLM):** **44/44 passed** — 8 v0.2 + 12 v0.3 + **20 adversarial** + **4 grounded-judge** (fail-closed without reference, fingerprint roundtrip+validation, evidence persistence, sanitizer drops invented axis). **Lint:** `ok:true` — 26 methods.
- **Frontend smoke test:** 5 pages — HTTP 200, 0 console errors; landing→escrow CTA navigation works; live reads confirmed; **the Verify UI renders the grounded rationale** (quote + axis per probe) from the live contract; wallet connect not yet tested (no MetaMask in this environment).

Atomic settle is verified on-chain: after `verify_fingerprint` returns a verdict, the bound task's `status`/`verdict` matches it — no cross-contract callbacks, no stale escrow.

Verification:

```bash
genlayer call 0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F get_probe_bank
genlayer call 0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F get_reference_fingerprint --args gpt-4o
genlayer call 0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F get_attestation --args att-1
genlayer schema 0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F
```

> Reference fingerprints for 5 model families are loaded on the canonical contract (see `deployments.json`). Verify always requires owner-committed ground truth.

> In the pre-grounding run, the demo transcript produced MISMATCH/50 — 2 of 4 probes (including a critical one) were judged false by the validators. That proved the end-to-end pipeline works (consensus → verdict → fail-closed gate). With the gpt-4o reference loaded on v0.4+, the same transcript yields MATCH with `confidence=medium`/`high` (P1 grounded on `causal_chain` + verbatim quote; P2–P4 non-discriminating → true without quotes — see `get_attestation` → `evidence_detail`). The verdict reflects the quality of the reference — truth stays bound to sources, not model guesswork.

The default rubric (4 probes, 2 critical + 2 advisory, threshold 75) lives in `tests/direct/fixtures.py` as an example — deploy with your own rubric.

## Setup & Test

```bash
pip install -r requirements.txt
```

Lint:

```bash
genvm-lint check contracts/model_fingerprint_verifier.py
```

Direct-mode tests (no server, mocked LLM/web, ~0.7s):

```bash
pytest tests/direct/ -v
```

## Deploy

```bash
npm install -g genlayer
genlayer network set testnet-bradbury   # or studionet (gasless)
genlayer deploy --contract contracts/model_fingerprint_verifier.py --args '<RUBRIC_JSON>'
genlayer receipt <txHash> --stdout --stderr
genlayer call <address> get_probe_bank
```

## Files

```
contracts/model_fingerprint_verifier.py   # Intelligent Contract (single: verifier + escrow)
collector/providers.py                    # off-chain collector (OpenAI-compatible)
collector/probes.json                     # 10-probe bank (Pei et al. diagnostic suite)
collector/rubric_v2.json                  # v2 contract rubric (min_match 80)
collector/reference_fingerprints.json     # per-model axes from Behavioral Fingerprinting
collector/docs/calibration.md              # why v2, thresholds, anti-gaming
frontend/                                 # Next.js + GenLayerJS dashboard (landing, how-it-works, verify, escrow, rubric)
scripts/smoke_onchain.py                  # canonical happy-path smoke (MATCH, value transfer, LLM consensus)
scripts/smoke_onchain_appeal.py           # canonical appeal-path smoke (INCONCLUSIVE -> appeal -> resolve)
scripts/deploy_v04.py                     # deploy canonical contract + load library + load 5 references
scripts/seed_demo_attestation.py          # seed att-1 on the canonical deployment (grounded judge demo)
scripts/seed_identity_and_task.py          # bind ERC-8004 identity + create task-1 (escrow lookup demo)
tests/direct/test_model_fingerprint_verifier.py
tests/direct/test_v03.py                          # 12 tests, v0.3 (appeal/identity/library)
tests/direct/test_adversarial.py                  # 24 tests: adversarial + grounded judge (fail-closed, sanitizer, evidence)
tests/integration/test_model_fingerprint_verifier.py   # 7 tests, StudioNet + LLM
tests/integration/test_escrow_e2e.py                    # 7 tests, escrow + LLM auto-settle
tests/integration/test_v03_e2e.py                       # 7 tests, appeal-reversal + identity + library
BLUEPRINT.md                              # GenLayer analysis + design
VISION.md                                 # vision, mission, goals
deployments.json                          # StudioNet deployment record
```

## Roadmap

- **v0.1 MVP:** contract + lint + direct tests. No escrow yet. ✅
- **v0.2:** escrow + verifier **single contract**, atomic settle inside the verdict transaction. ✅
- **v0.3:** ERC-8004 identity binding (owner-set) + reference fingerprint library commitment (sha256, versioned) + appeal-reversal for escrow (bond, owner adjudication, INCONCLUSIVE re-review) + INCONCLUSIVE manual-review fix (`settle_task` now accepts HELD tasks). ✅
- **v0.3.1:** adversarial-review fixes (zero-stake settle, Address coercion, ASCII-only) + full on-chain smokes (happy path + appeal path). ✅
- **v0.4 / v0.4.1:** **grounded judge** — AI may only deliver a verdict with sources (on-chain reference fingerprint + transcript); per-probe verbatim quotes + audited axes (`evidence_detail`); sanitizer drops invented axes; fail-closed without ground truth; consensus stays on bits. Plus full rebrand to **Veriphon** (product name, docs, frontend, contract class); canonical v0.4.1 = `0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F`. ✅
- **v1.0:** public probe bank, cross-agent reputation, public dashboard.

## References

- https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle
- https://github.com/0xyuura/genlayer-rubric
- https://github.com/madgoddev/auction-settlement-judge
- https://github.com/Frankznation/genlayer-task-verifier
- https://github.com/Chinny070/consensus

## Honest limits

This project cannot cryptographically prove that the weights are 100% model X — GenLayer only sees black-box behavior. What you get is: **behavioral evidence of consistency/inconsistency with the claim, via a transparent validator consensus.** That is why `INCONCLUSIVE` exists. Behavior against a reference is not the same as proof of weights — the reference is the argument, and appeals are the recovery path.

