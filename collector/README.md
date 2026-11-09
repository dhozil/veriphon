# Transcript Collector

Off-chain collector that calls the agent API with private API keys, then
produces a source-bound transcript JSON + SHA-256 for submission to the contract.

**Boundary (mandatory):** API keys never enter the GenLayer contract.
The contract only accepts the transcript JSON + its hash (deterministic gate).
The transcript must also carry the attestation challenge nonce and the registered
endpoint commitment hash; each response must echo the nonce.

## Provider adapters (providers.py)

One abstraction per provider family. A new model = a new argument, not new code.

```bash
python collector/providers.py list
python collector/providers.py test --provider openai
python collector/providers.py collect --provider openai --model gpt-4o \
  --agent-id agent-1 --mock \
  --challenge-nonce <challenge_nonce from get_challenge> \
  --endpoint-commitment-hash <registered endpoint_commitment_hash> \
  --out transcripts/gpt-4o.json
```

Real (non-mock) collection requires both `--challenge-nonce` and
`--endpoint-commitment-hash`; the collector presents the nonce in every probe
prompt and asks the model/endpoint to echo it before answering.

Keys come from the environment (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`).
`test` only shows SET/missing + length, never prints the key.
`--mock` is for CI without network access (deterministic stub, transcript-shaped).

## Probe bank (probes.json)

10 probes from the Behavioral Fingerprinting diagnostic suite
(Pei et al., arXiv 2509.04504). See `docs/calibration.md` for which traits are
discriminating vs advisory-only, and why the threshold is 80.

## Rubric v2

`rubric_v2.json` is the contract rubric for this probe bank. Deployed via
`set_probe_bank(rubric_json, advisory_tolerance)` (owner-only) -> version+1,
new hash. Old attestations automatically no longer count (fail-closed).

## Reference fingerprints

`reference_fingerprints.json` = the per-model axes from the paper (GPT-4o/5, Claude,
Grok, Llama). In v0.4 these axes also became the **ground truth the contract's LLM
judge is bound to** — see `set_reference_fingerprint` in the main contract and the
`collector/reference_fingerprints.json` -> on-chain `reference_fingerprints` mapping
(verified in `deployments.json`).

## Legacy path (transcript_collector.py)

A single generic provider via `--api-base/--api-key`. Still used for
custom agents that don't fit the provider catalog.

## Submit to the contract

1. **From the frontend** (`/verify`): paste the contents of `transcripts/*.json` into
   the textarea, then click Submit transcript → Verify fingerprint.
2. **From the CLI** via `genlayer write`:

```bash
genlayer write <CONTRACT> submit_transcript --args "att-1" '<TRANSCRIPT_JSON>' '<SHA256_HASH>'
genlayer write <CONTRACT> verify_fingerprint --args "att-1" '<TRANSCRIPT_JSON>'
```

Transcript schema: `{"agent_id": "...", "challenge_nonce": "...", "endpoint_commitment_hash": "...", "responses": [{"probe_id": "P1", "response": "..."}, ...]}`.
Every response must echo `challenge_nonce`. The transcript string must be identical at submit and verify time, because the
contract recomputes the SHA-256 of the content and compares it to the submitted hash. Replaying the same
payload against another attestation is rejected because its challenge nonce differs.
