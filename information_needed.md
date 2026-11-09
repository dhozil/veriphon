# Steward request — source-bound challenge-response: completion evidence

## Original request

> Please add a source-bound challenge and response flow that proves each reviewed transcript came from the registered endpoint, enforce `endpoint_commitment_hash` or an equivalent authenticated endpoint binding during verification, and have validators check persisted quotes, probe IDs, and axes against the bound transcript and selected reference. Include adversarial tests showing fabricated or replayed transcripts and invented evidence details are rejected.

## Implemented contract behavior

### 1. Challenge issuance

`request_attestation` now stores a source-bound challenge in the attestation:

- `challenge_nonce`: SHA-256 binding to rubric hash, endpoint commitment, attestation ID, agent ID, and requester.
- `challenge_hash`: SHA-256 binding to nonce, attestation ID, and agent ID.
- `endpoint_commitment_hash`: snapshot of the agent's registered endpoint commitment at request time.
- `challenge_probe_ids`: exact ordered list of probes selected for this attestation (currently all probes in the active rubric).
- `challenge_status`: `ISSUED`, then `SUBMITTED`, then `VERIFIED`.

New public view:

- `get_challenge(attestation_id)` exposes the challenge so an endpoint / collector can answer it before submission.

### 2. Transcript source binding

`submit_transcript` now requires a JSON transcript containing:

- `agent_id` equal to the attestation's agent.
- `challenge_nonce` equal to this attestation's challenge nonce.
- `endpoint_commitment_hash` equal to both the registered agent commitment and the attestation snapshot.
- exactly the selected challenge probes, with no missing, extra, or duplicate `probe_id`s.
- every response containing that attestation's challenge nonce.
- the submitted `transcript_hash` equal to SHA-256 of the exact submitted transcript string.

`verify_fingerprint` revalidates this source binding before invoking any LLM judgment. A transcript can therefore not silently be an old transcript, a transcript for another attestation, a transcript for another endpoint, or one without challenge/response evidence.

### 3. Evidence validation

The judge prompt includes the challenge nonce, challenge hash, endpoint commitment, selected probe IDs, and reference fingerprint. The consensus path now requires:

- exactly one evidence entry per selected probe, in probe order;
- each `probe_id` exactly matching the challenge-selected ID;
- each entry's `consistent` exactly matching the corresponding bit;
- each nonempty quote being a verbatim substring (max 140 chars) of that probe's own response;
- each `axis` either `null` or present in the axes of the selected on-chain reference fingerprint;
- derived verdict and match score recomputed from the bit vector and compared with the persisted consensus result.

The persisted `evidence_detail` is the validated per-probe rationale. The `evidence_hash` now binds bits, verdict, score, evidence entries, and confidence.

### 4. Collector and frontend binding

- `collector/providers.py` requires `--challenge-nonce` and `--endpoint-commitment-hash` for real collection, puts the nonce in every provider prompt, and writes both fields into the transcript.
- The frontend's `/verify` page reads `get_challenge`, automatically binds the transcript to the current challenge/endpoint commitment, prefixes each response with the nonce, and sends that exact string through the hash gate. Its new **Source-bound challenge (live)** card displays nonce, hash, endpoint commitment, and selected probes.

## Automated evidence

### Lint and direct-mode tests

- `genvm-lint check contracts/model_fingerprint_verifier.py --json`
  - Result: `ok: true`
  - Contract validated as `Veriphon`
  - `27` methods: `11` view and `16` write
- Direct suite:
  - Command: `pytest tests/direct -q`
  - Result: `50 passed in 3.92s`
- Source-binding adversarial tests:
  - `tests/direct/test_adversarial.py::test_challenge_is_issued_and_endpoint_bound`
  - `tests/direct/test_adversarial.py::test_unbound_transcript_rejected`
  - `tests/direct/test_adversarial.py::test_wrong_endpoint_transcript_rejected`
  - `tests/direct/test_adversarial.py::test_replayed_transcript_across_attestations_rejected`
  - `tests/direct/test_adversarial.py::test_missing_or_extra_probe_transcript_rejected`
  - `tests/direct/test_adversarial.py::test_evidence_rejects_fabricated_quote_cross_probe_and_wrong_axis`
  - `tests/direct/test_adversarial.py::test_evidence_rejects_invented_axis`
  - `tests/direct/test_adversarial.py::test_evidence_detail_persisted_from_leader`

### StudioNet integration suites

Command:

```bash
gltest tests/integration/test_model_fingerprint_verifier.py \
  tests/integration/test_escrow_e2e.py \
  tests/integration/test_v03_e2e.py \
  -v -s --network studionet
```

Result: **21 passed in 984.55s**, using real validator LLM consensus and source-bound transcripts.

### StudioNet source-binding adversarial suite

Command:

```bash
gltest tests/integration/test_source_binding_adversarial.py \
  -v -s --network studionet
```

Result: **4 passed in 136.25s**.

The following rejected transactions were printed by the passing suite:

| Attempt | Rejected transaction | Expected effect |
|---|---|---|
| Unbound transcript copied into the attestation | `0x813469eec60c625d5129eddcd8d948385b405770a2615b1139e411e0b0530743` | GenVM rollback / `tx_execution_failed`; missing challenge and endpoint binding |
| Wrong-endpoint bound transcript (`endpoint-hash-999`) | `0x86f41d18043afb094308b29596c8025f799455db375ff95178d3620267c54a92` | GenVM rollback / `tx_execution_failed`; wrong endpoint commitment |
| Transcript valid for `att-reject-replay` replayed into `att-reject-replay-2` | `0x603ee81450d66621c4202af912c2fbb82599493204dd558d7c506900fe9aecf4` | GenVM rollback / `tx_execution_failed`; attestation-specific nonce mismatch |

Explorer links:

- Unbound rejection: <https://explorer-studio.genlayer.com/tx/0x813469eec60c625d5129eddcd8d948385b405770a2615b1139e411e0b0530743>
- Wrong-endpoint rejection: <https://explorer-studio.genlayer.com/tx/0x86f41d18043afb094308b29596c8025f799455db375ff95178d3620267c54a92>
- Replay rejection: <https://explorer-studio.genlayer.com/tx/0x603ee81450d66621c4202af912c2fbb82599493204dd558d7c506900fe9aecf4>

These were executed against the throwaway deployment `0x3Ae917cc330F8CF1a6f75B423513067ADc8bc407` created by the suite, not the canonical funding contract, so they do not alter demo state.

## Canonical deployment used for positive evidence

- Contract: <https://explorer-studio.genlayer.com/contracts/0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F>
- Deploy transaction: <https://explorer-studio.genlayer.com/tx/0x04ad4bc1ce745d0aed55be28da33ec87b6d03d37b90dda922c4140d50c666087>
- Reference-library commitment: <https://explorer-studio.genlayer.com/tx/0x3ef34c63f3b3bf9f4ed74e6322b42b88006bd77e02ae8cfc6f710e98735e4f2a>
- Reference fingerprints committed for `gpt-4o`, `gpt-5`, `claude-opus-4.1`, `grok-4`, and `llama-3.1-405b`; reads returned `found=True` for every model.

### Source-bound `att-1` evidence

The demo attestation is now challenge-bound and verified on-chain:

- Request attestation: <https://explorer-studio.genlayer.com/tx/0xf7ba16ca21f77a395c3baa1a84539f3d457128b0463a6a2bfee7959377fdc28a>
- Submit source-bound transcript: <https://explorer-studio.genlayer.com/tx/0xc6d0643f74603e18458ecd5ddaeac129c0462f3a0aed4dc02db37838b31d4233>
- Verify fingerprint: <https://explorer-studio.genlayer.com/tx/0x275e232d35e5fae075fdb79c515aeb82dd845faf576193155b686709ddd67719>
- Registered challenge:
  - `challenge_nonce`: `6871eaa8eb05088ba4243729ee2d6a8223c808da3ccfe5020fc986721b98fba1`
  - `challenge_hash`: `9da93ceba0bb47176f46485832d599e11824ab245179effb77d0c3dea98a25f3`
  - `endpoint_commitment_hash`: `endpoint-hash-1`
  - `challenge_probe_ids`: `["P1","P2","P3","P4"]`
  - `challenge_status`: `VERIFIED`
- Final persisted state:
  - `status`: `VERIFIED`
  - `verdict`: `MATCH`
  - `match_score`: `100`
  - `evidence_hash`: `de31807380655445549313bf9b17698a8734a7d444420149dc7e15b5d3d1f2c9`
  - `evidence_detail.confidence`: `high`
  - `P1`: exact verbatim quote, axis `causal_chain`
  - `P2`: exact verbatim quote, axis `abstract_reasoning`
  - `P3`: exact verbatim quote, axis `null`
  - `P4`: exact verbatim quote, axis `sycophancy_resistance`

### Atomic escrow evidence

Source-bound smoke `smoke-agent-1794239705` / `smoke-task-1794239705`:

- Register: <https://explorer-studio.genlayer.com/tx/0xfd150f9659f6502415bc8585d3067ad7abd4ff0b77f88de9e5ce4721a3255e4f>
- Request attestation: <https://explorer-studio.genlayer.com/tx/0x50fcfd66e6d17db62b73f2f137bdbcea54cb108a06848f06b6bc6bee747f538d>
- Submit bound transcript: <https://explorer-studio.genlayer.com/tx/0xc8cc6644dd402df42402c3384da13ad371cd3d179e2fec403d63a198bae7e5f3>
- Create escrow task: <https://explorer-studio.genlayer.com/tx/0xcd9141c4f3910461a35ae8f42d98c111eb635d1bf5281c0e49d2670a8607cd98>
- Verify and atomically settle: <https://explorer-studio.genlayer.com/tx/0x5ed84505621ad4234a1554d70f0dc9bfbc66b32ec0cb452102ca444f67cca665>

Final read: task `RELEASED`, verdict `MATCH`, `is_verified=True`.

### Other canonical state

- ERC-8004 binding for `agent-1`: set identity <https://explorer-studio.genlayer.com/tx/0xb544ce3d00f355c5b385b3d1a3ba7cd5155b8d85b3426c58fcb52c739aa2b78b>; default registry <https://explorer-studio.genlayer.com/tx/0xf50791e698075e0241cff866370756d214f538e5e9d71dd75b3d1da0b0c63f1f>.
- Escrow `task-1`: <https://explorer-studio.genlayer.com/tx/0x21b86d5931ceca1c715270025efb984380e7633892384b66253dd425b983bcd7>, remaining `FUNDED` with stake locked at 1000 raw units.

## Rejection observed during development

Before `smoke_onchain.py` was corrected to bind `agent_id` explicitly, the source-binding gate rejected its first canonical submissions:

- Submit with agent mismatch: <https://explorer-studio.genlayer.com/tx/0xa45596eb9bd6c30f0359289f7a05feb6e623be2b28fdd22d0d435160f3abf531>
  - Leader receipt payload: `[EXPECTED] Transcript agent_id does not match attestation`
- Follow-up verify with no transcript in state: <https://explorer-studio.genlayer.com/tx/0xc66b4e9461ff96500eba63fa4ea314c91ea90fe35477b3cbc38f54a5aed2a877>
  - Leader receipt payload: `[EXPECTED] No transcript submitted yet`

Those two transactions were rollback receipts from the corrected smoke run and are additional canonical evidence of fail-closed binding.

## Scope note

The implemented binding proves that a transcript answers this attestation's exact challenge and matches the registered endpoint commitment stored in contract state. It blocks stale, cross-attestation, cross-endpoint, fabricated, and arbitrarily attributed transcript reuse.

It does **not** by itself provide an endpoint-side cryptographic signature over the response, because generic OpenAI-compatible endpoints do not emit signed transcript receipts and the contract never receives API credentials. A provider-signed challenge/response receipt would be an additional authenticity layer if an endpoint or gateway can issue one.

## Files changed for the requested behavior

- `contracts/model_fingerprint_verifier.py`
  - Challenge issuance and storage; source-bound transcript parsing/validation; evidence validation; challenge view; strict quote/probe/axis checks.
- `collector/providers.py`
  - Optional (real-mode mandatory) challenge/endpoint flags; nonce-bearing probe prompts; bound transcript metadata.
- `collector/README.md`
  - Challenge-bound collection instructions and schema.
- `frontend/src/lib/contract-hooks.ts`
  - `useChallenge` read hook and expanded attestation/challenge types.
- `frontend/src/app/verify/page.tsx`
  - Source-bound challenge card and automatic transcript binding before submit/verify.
- `tests/direct/fixtures.py`
  - `bound_transcript` and grounded `valid_judge_payload` helpers.
- `tests/direct/test_adversarial.py`
  - Direct adversarial tests for unbound transcripts, wrong endpoint, replay, incomplete probes, fabricated quotes, order/probe violations, and invented axes.
- `tests/integration/fixtures.py`
  - `bound_transcript` helper for StudioNet suites.
- `tests/integration/test_source_binding_adversarial.py`
  - Real StudioNet rejection transactions for unbound, wrong-endpoint, and replayed transcripts.
- `tests/integration/test_model_fingerprint_verifier.py`
- `tests/integration/test_escrow_e2e.py`
- `tests/integration/test_v03_e2e.py`
  - Existing StudioNet suites now submit source-bound transcripts.
- `tests/direct/test_model_fingerprint_verifier.py`
- `tests/direct/test_v03.py`
  - Updated direct fixtures, bound transcripts, and strict evidence payloads.
- `scripts/seed_demo_attestation.py`
- `scripts/smoke_onchain.py`
- `scripts/smoke_onchain_appeal.py`
  - Canonical scripts now read the challenge and submit challenge-bound transcripts.
- `deployments.json`
  - Canonical v0.5 deployment, literature/reference commits, and smoke context.
