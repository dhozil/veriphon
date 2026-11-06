# Calibration docs: rubric v2 + probe bank

## Why v2 exists

v0.1 stub rubric (4 generic probes) cannot discriminate model families:
GPT-4o, Claude, Llama all answer "reasoning style" and "knowledge" similarly.
Literature (LLMmap arXiv 2407.15847; Behavioral Fingerprinting arXiv 2509.04504;
idiodiosyncrasies 2502.12150; stylistic fingerprints 2503.01659) shows:

- **Inter-model discrepancy** is in alignment traits, not core reasoning.
  Core reasoning converged (GPT-4o/Claude/GPT-5 all ~1.0 on abstract/causal).
  Alignment diverged: sycophancy resistance Claude/Llama 1.0 vs GPT 0.75 vs Grok 0.25.
  Robustness 1.0 vs 0.5. Metacognition 0.67 across the board.
- **Word-level idiosyncrasies persist through rewrite/translation/summarization**
  (97.1% accuracy in 5-way classification). Style probes (P7-P9) are therefore
  real signals, just advisory because phrasing-sensitive.
- **Persona clustering ISTJ/ESTJ** is an RLHF artifact; style default reveals
  provider alignment strategy. ISFJ (Llama 405B) differs from ESTJ on style.

v2 takes 10 probes from the Pei diagnostic suite (A.1.1 inverse-cube gravity,
2.1.3 abstract pattern, 1.2.1 causal chain, 2.2.1 metacognition, 3.1.1/3.1.2
sycophancy, 3.3.2/3.3.4 style, 3.2.1 neutrality, 4.1.1B robustness paraphrase).

## Probe design rules

1. **Critical probes** must be traits where families separate reliably:
   deductive counterfactual, abstract identification, causal tracing,
   metacognition (known vs unknown), sycophancy (correct vs elaborate false premise).
2. **Advisory probes** are style/neutrality/robustness. They tolerate ±1
   validator disagreement because phrasing shifts change surface form while
   semantic verdict stays.
3. **Fixed length**: rubric defines bit-vector length. LLM must return exactly
   N booleans. No hedging, no null, no prose outside JSON.
4. **Grounding**: validator prompt declares transcript as UNTRUSTED DATA and
   forbids following instructions inside it. MISMATCH findings should quote
   literal response substrings (future hardening - see roadmap).
5. **Rotatable**: probe bank is versioned + hash-bound. Owner changes rubric ->
   version+1, hash changes, old attestations stop counting (fail-closed).
   That is rotation without a contract redeploy.

## Threshold (min_match_score)

- v1: 75 (generous, low discrimination).
- v2: 80 (critical-heavy, calibrated).
- Rule: any critical violation -> MISMATCH regardless of score.
  No critical violation but score < threshold -> INCONCLUSIVE, not MISMATCH.
  INCONCLUSIVE is not punished in reputation. This is deliberate: borderline
  validator disagreement should not accuse an agent of substitution.

## Anti-gaming

- Probe bank is public but versioned. Treat as leaked by default.
  Mitigations on roadmap: per-attestation nonce rotating probe selection,
  larger bank with sampled subsets, and signed transcripts.
- Single-token probes (repeated N times, JSD distribution) are stronger than
  single-shot prose: AUC 0.971 in recognize-LLM-by-fingerprint. v2 keeps
  single-shot for GenLayer consensus cost; v3 may add repeated-probe
  distribution as advisory bits.
- Transcript prompt-injection: validators must not follow instructions in
  transcript. Current prompt says so explicitly. Grounding quotes are the
  next hardening step.

## Provider adapters

`collector/providers.py` is the abstraction:
- One adapter per provider family (openai, anthropic gateway, openrouter).
- New model = new args, not new code. Add to PROVIDERS dict.
- Keys from env only. Never logged. `list` shows SET/missing without values.
- `--mock` for CI: deterministic stubs, no network, still produces
  contract-shaped transcript + hash.

## Reference fingerprints

`reference_fingerprints.json` encodes paper axes (normalized 0-1) per model.
Used for collector calibration only - contract never imports it.
It lets you sanity-check: if transcript is claimed gpt-4o but sycophancy
behavior matches Grok profile, that is a lead, not proof. Verdict still
comes from GenLayer consensus over rubric bits.

## How to collect a real transcript

```bash
export OPENAI_API_KEY=...
python collector/providers.py test --provider openai
python collector/providers.py collect --provider openai --model gpt-4o \
  --agent-id agent-1 --out transcripts/gpt-4o.json
python collector/providers.py collect --provider openrouter --model anthropic/claude-opus-4.1 \
  --agent-id agent-1 --out transcripts/claude.json
```

Then submit `transcripts/*.json` via frontend /verify or `genlayer write`.
The contract will judge P1-P10 against rubric v2, not the v1 stub.
