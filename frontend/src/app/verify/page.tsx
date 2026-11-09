"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAgent,
  useAgentIdentity,
  useAttestation,
  useChallenge,
  useIsVerified,
  useProbeBank,
  useWrite,
} from "@/lib/contract-hooks";
import { CONTRACT_ADDRESS, DEMO_AGENT_ID, DEMO_ATTESTATION_ID, shortenAddress, sha256HexAsync } from "@/lib/contract";
import { useWallet } from "@/lib/wallet";

const DEMO_TRANSCRIPT = JSON.stringify(
  {
    agent_id: DEMO_AGENT_ID,
    responses: [
      { probe_id: "P1", response: "Here is the step-by-step chain of thought..." },
      { probe_id: "P2", response: "The correct answer is 42 because..." },
      { probe_id: "P3", response: "## Answer\n\n- bullet one\n- bullet two" },
      { probe_id: "P4", response: "In brief, the summary is concise and hedging-free." },
    ],
  },
  null,
  2
);

export default function VerifyPage() {
  const { address, connecting } = useWallet();
  const bank = useProbeBank();
  const agent = useAgent(DEMO_AGENT_ID);
  const identity = useAgentIdentity(DEMO_AGENT_ID);
  const att = useAttestation(DEMO_ATTESTATION_ID);
  const challenge = useChallenge(DEMO_ATTESTATION_ID);
  const verified = useIsVerified(DEMO_AGENT_ID, "gpt-4o");
  const wr = useWrite();

  const [transcript, setTranscript] = React.useState(DEMO_TRANSCRIPT);
  const [bindError, setBindError] = React.useState<string | null>(null);

  function buildBoundTranscript(raw: string): string {
    if (!challenge.data) throw new Error("Source challenge has not loaded yet. Reload the challenge card before submitting.");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const responses = Array.isArray(parsed.responses) ? parsed.responses : [];
    const nonce = challenge.data.challenge_nonce;
    const next = {
      ...parsed,
      agent_id: DEMO_AGENT_ID,
      challenge_nonce: nonce,
      endpoint_commitment_hash: challenge.data.endpoint_commitment_hash,
      responses: responses.map((item) => {
        if (!item || typeof item !== "object") return item;
        const row = item as Record<string, unknown>;
        const response = typeof row.response === "string" ? row.response : "";
        return response.includes(nonce) ? row : { ...row, response: response ? `${nonce}\n${response}` : nonce };
      }),
    };
    return JSON.stringify(next, null, 2);
  }

  async function onRegister() {
    await wr.write("register_agent", [
      DEMO_AGENT_ID,
      "gpt-4o",
      "2024-11-20",
      "endpoint-hash-1",
    ]);
    agent.reload();
  }

  async function onRequest() {
    setBindError(null);
    await wr.write("request_attestation", [DEMO_ATTESTATION_ID, DEMO_AGENT_ID]);
    att.reload();
    challenge.reload();
  }

  async function onSubmit() {
    let bound: string;
    try {
      setBindError(null);
      bound = buildBoundTranscript(transcript);
    } catch (e) {
      setBindError(e instanceof Error ? e.message : String(e));
      return;
    }
    setTranscript(bound);
    const hash = await sha256HexAsync(bound);
    await wr.write("submit_transcript", [DEMO_ATTESTATION_ID, bound, hash]);
    att.reload();
  }

  async function onVerify() {
    let bound: string;
    try {
      setBindError(null);
      bound = buildBoundTranscript(transcript);
    } catch (e) {
      setBindError(e instanceof Error ? e.message : String(e));
      return;
    }
    setTranscript(bound);
    await wr.write("verify_fingerprint", [DEMO_ATTESTATION_ID, bound]);
    att.reload();
    verified.reload();
  }

  const disabled = !address || connecting || wr.pending;
  const verdictColor =
    att.data?.verdict === "MATCH"
      ? "text-emerald-400"
      : att.data?.verdict === "MISMATCH"
        ? "text-red-400"
        : "text-indigo-300";

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-1/4 h-96 w-96 rounded-full bg-indigo-500/12 blur-3xl float-slow" />
        <div className="absolute top-96 left-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl float-slow-2" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-14">
        <h1 className="text-gradient text-4xl font-bold tracking-tight md:text-5xl">Verify</h1>
        <p className="mt-2 max-w-2xl text-slate-300">
          Live read of the StudioNet contract{" "}
          <code className="rounded bg-white/10 px-1 text-xs">{shortenAddress(CONTRACT_ADDRESS)}</code>.
          Write actions need a wallet; reads are public.
        </p>

        {!address && (
          <p className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-3 text-sm text-indigo-200">
            Wallet not connected. Reads below work without a wallet; write buttons
            stay disabled until you connect MetaMask / Rabby (top right).
          </p>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {/* Live state */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <Card title="Probe bank (live)" action={<ReloadBtn onClick={bank.reload} />}>
                {bank.status === "loading" && <LoadingRow />}
                {bank.status === "error" && <ErrorRow msg={bank.error} />}
                {bank.status === "success" && bank.data && (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <Field k="version" v={String(bank.data.version)} />
                    <Field k="advisory_tolerance" v={String(bank.data.advisory_tolerance)} />
                    <Field k="rubric_hash" v={truncate(bank.data.rubric_hash)} mono />
                  </dl>
                )}
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.08 }}>
              <Card title="Agent (live)" action={<ReloadBtn onClick={agent.reload} />}>
                {agent.status === "loading" && <LoadingRow />}
                {agent.status === "error" && <ErrorRow msg={agent.error} />}
                {agent.status === "success" && agent.data && (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <Field k="claimed_model" v={agent.data.claimed_model} />
                    <Field k="model_version" v={agent.data.model_version} />
                    <Field k="reputation" v={String(agent.data.reputation)} />
                    <Field k="endpoint_hash" v={truncate(agent.data.endpoint_commitment_hash)} mono />
                  </dl>
                )}
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
              <Card title="Agent identity - ERC-8004 (live)" action={<ReloadBtn onClick={identity.reload} />}>
                {identity.status === "loading" && <LoadingRow />}
                {identity.status === "error" && <ErrorRow msg={identity.error} />}
                {identity.status === "success" && identity.data && (
                  <>
                    <p className="text-sm">
                      {identity.data.bound ? (
                        <span className="font-semibold text-emerald-400">Bound on-chain</span>
                      ) : (
                        <span className="font-semibold text-amber-400">Not bound yet</span>
                      )}
                      <span className="text-slate-400"> — default registry </span>
                      <code className="rounded bg-white/10 px-1 text-xs">{truncate(identity.data.default_registry)}</code>
                    </p>
                    {identity.data.bound && (
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <Field k="registry" v={truncate(identity.data.registry)} mono />
                        <Field k="token_id" v={identity.data.token_id} />
                        <Field k="agent_uri" v={truncate(identity.data.uri)} mono />
                      </dl>
                    )}
                  </>
                )}
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.13 }}>
              <Card title="Source-bound challenge (live)" action={<ReloadBtn onClick={challenge.reload} />}>
                {challenge.status === "loading" && <LoadingRow />}
                {challenge.status === "error" && <ErrorRow msg={challenge.error} />}
                {challenge.status === "success" && challenge.data && (
                  <>
                    <p className="text-sm">
                      {challenge.data.challenge_status === "VERIFIED" ? (
                        <span className="font-semibold text-emerald-400">Verified from this challenge</span>
                      ) : (
                        <span className="font-semibold text-indigo-300">Challenge {challenge.data.challenge_status}</span>
                      )}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Field k="challenge_nonce" v={truncate(challenge.data.challenge_nonce)} mono />
                      <Field k="challenge_hash" v={truncate(challenge.data.challenge_hash)} mono />
                      <Field k="endpoint_commitment" v={truncate(challenge.data.endpoint_commitment_hash)} mono />
                      <Field k="selected_probes" v={challenge.data.challenge_probe_ids || "-"} mono />
                    </dl>
                  </>
                )}
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.16 }}>
              <Card title="AI consensus verdict (live)" action={<ReloadBtn onClick={att.reload} />}>
                {att.status === "loading" && <LoadingRow />}
                {att.status === "error" && <ErrorRow msg={att.error} />}
                {att.status === "success" && att.data && (
                  <>
                    <div className="flex items-center gap-3">
                      <VerdictIcon verdict={att.data.verdict} />
                      <p className={`text-2xl font-bold ${verdictColor}`}>
                        {att.data.verdict || "PENDING"}
                      </p>
                      <p className="text-sm text-slate-400">score {att.data.match_score}</p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Field k="status" v={att.data.status} />
                      <Field k="attestation_id" v={att.data.attestation_id} />
                      <Field k="transcript_hash" v={truncate(att.data.submitted_transcript_hash)} mono />
                      <Field k="evidence_hash" v={truncate(att.data.evidence_hash)} mono />
                    </dl>
                    <EvidenceDetail raw={att.data.evidence_detail} />
                  </>
                )}
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.24 }}>
              <Card title="Fail-closed gate">
                {verified.status === "loading" && <LoadingRow />}
                {verified.status === "error" && <ErrorRow msg={verified.error} />}
                {verified.status === "success" && (
                  <p className="text-sm">
                    <code className="rounded bg-white/10 px-1 text-xs">is_verified(agent-1, gpt-4o)</code>{" "}
                    = <strong className={verified.data ? "text-emerald-400" : "text-red-400"}>{String(verified.data)}</strong>
                  </p>
                )}
              </Card>
            </motion.div>
          </div>

          {/* Actions */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <Card title="Actions (write, network: StudioNet)">
                <div className="grid grid-cols-2 gap-2">
                  <Button disabled={disabled} onClick={onRegister}>
                    {wr.pending ? "Pending..." : "Register agent"}
                  </Button>
                  <Button variant="outline" disabled={disabled} onClick={onRequest}>
                    Request attestation
                  </Button>
                  <Button variant="outline" disabled={disabled} onClick={onSubmit}>
                    Submit transcript
                  </Button>
                  <Button disabled={disabled} onClick={onVerify}>
                    Verify fingerprint
                  </Button>
                </div>
                {bindError && (
                  <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="alert">
                    {bindError}{" "}
                    <button className="underline" onClick={() => setBindError(null)}>
                      dismiss
                    </button>
                  </p>
                )}
                {wr.error && (
                  <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
                    {wr.error}{" "}
                    <button className="underline" onClick={wr.clearError}>
                      dismiss
                    </button>
                  </p>
                )}
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.08 }}>
              <Card title="Transcript JSON (exact string matters)">
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-white/10 bg-ink p-3 font-mono text-xs text-slate-200 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Submit automatically binds this exact string to the current source
                  challenge and registered endpoint commitment. Verify must use the same
                  bound string, and its SHA-256 must match the submitted hash or the contract reverts.
                </p>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl border border-white/10 bg-panel/80 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-slate-500">{k}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : "break-all"}>{v}</dd>
    </div>
  );
}

function LoadingRow() {
  return (
    <p className="flex items-center gap-2 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin text-indigo-300" /> Loading from contract...
    </p>
  );
}

function ErrorRow({ msg }: { msg: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-red-300" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {msg}
    </p>
  );
}

function ReloadBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <RefreshCw className="h-4 w-4" />
    </Button>
  );
}

function EvidenceDetail({ raw }: { raw?: string }) {
  const parsed = React.useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as {
        confidence?: string;
        evidence?: Array<{ probe_id: string; consistent: boolean; quote: string; axis: string | null }>;
      };
    } catch {
      return null;
    }
  }, [raw]);

  if (!parsed) return null;
  const items = Array.isArray(parsed.evidence) ? parsed.evidence : [];
  if (items.length === 0 && !parsed.confidence) return null;

  const conf = parsed.confidence ?? "low";
  const confTone =
    conf === "high" ? "text-emerald-400" : conf === "medium" ? "text-amber-300" : "text-slate-400";

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <p className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        Grounded rationale (leader run, auditable)
        <span className={`font-mono ${confTone}`}>confidence {conf}</span>
      </p>
      <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
        {items.map((e, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={e.consistent ? "text-emerald-400" : "text-red-400"}>
              {e.consistent ? "✓" : "✗"}
            </span>
            <span className="min-w-0">
              <code className="text-[10px] text-slate-500">{e.probe_id}</code>
              {e.axis ? (
                <span className="ml-1 rounded bg-white/5 px-1 text-[10px] text-indigo-300">{e.axis}</span>
              ) : null}
              {e.quote ? (
                <span className="mt-0.5 block text-[11px] italic leading-snug text-slate-500">
                  “{e.quote}”
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VerdictIcon({ verdict }: { verdict: string }) {
  if (verdict === "MATCH") return <CheckCircle2 className="h-7 w-7 text-emerald-400" />;
  if (verdict === "MISMATCH") return <XCircle className="h-7 w-7 text-red-400" />;
  return <AlertTriangle className="h-7 w-7 text-indigo-300" />;
}

function truncate(s: string) {
  if (!s) return "-";
  return s.length > 18 ? `${s.slice(0, 8)}...${s.slice(-6)}` : s;
}
