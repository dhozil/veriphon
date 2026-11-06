"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coins,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Slash,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useBalanceInfo,
  useTask,
  useWrite,
} from "@/lib/contract-hooks";
import { CONTRACT_ADDRESS, shortenAddress } from "@/lib/contract";
import { useWallet } from "@/lib/wallet";

const DEFAULT_AGENT_PAYOUT = "0x99bF44395CaC814E671ADFF8b69d968Fac4e5Db3";

export default function EscrowPage() {
  const { address, connecting } = useWallet();
  const balance = useBalanceInfo();
  const wr = useWrite();

  // Create form
  const [taskId, setTaskId] = React.useState("task-1");
  const [agentId, setAgentId] = React.useState("agent-1");
  const [attestationId, setAttestationId] = React.useState("att-1");
  const [agentPayout, setAgentPayout] = React.useState(DEFAULT_AGENT_PAYOUT);
  const [stake, setStake] = React.useState("1000");

  // Lookup
  const [lookupId, setLookupId] = React.useState("task-1");
  const [lookedUp, setLookedUp] = React.useState<string | null>(null);
  const lookup = useTask(lookedUp ?? "");

  // Owner controls
  const [settleVerdict, setSettleVerdict] = React.useState("MATCH");
  const [ownerTaskId, setOwnerTaskId] = React.useState("task-1");
  const [newMinStake, setNewMinStake] = React.useState("1000");
  const [newPool, setNewPool] = React.useState("");
  const [appealAttId, setAppealAttId] = React.useState("att-1");
  const [appealRuling, setAppealRuling] = React.useState("MATCH");
  const [appealNote, setAppealNote] = React.useState("owner adjudication");

  const disabled = !address || connecting || wr.pending;

  async function onCreate() {
    const value = safeBigInt(stake);
    if (value === null || value <= BigInt(0)) {
      wr.clearError();
      return;
    }
    await wr.write(
      "create_task",
      [taskId.trim(), agentId.trim(), attestationId.trim(), agentPayout.trim()],
      value
    );
    balance.reload();
  }

  async function onSettle() {
    await wr.write("settle_task", [ownerTaskId.trim(), settleVerdict]);
    balance.reload();
    lookup.reload();
  }

  async function onSetMinStake() {
    const v = safeBigInt(newMinStake);
    if (v === null) return;
    await wr.write("set_min_stake", [v]);
    balance.reload();
  }

  async function onSetPool() {
    if (!newPool.trim()) return;
    await wr.write("set_pool", [newPool.trim()]);
    balance.reload();
  }

  async function onResolveAppeal() {
    if (!appealAttId.trim()) return;
    await wr.write("resolve_appeal", [appealAttId.trim(), appealRuling, appealNote.trim()]);
    balance.reload();
    lookup.reload();
  }

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-1/4 h-96 w-96 rounded-full bg-indigo-500/12 blur-3xl float-slow" />
        <div className="absolute top-96 left-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl float-slow-2" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-14">
        <h1 className="text-gradient text-4xl font-bold tracking-tight md:text-5xl">Escrow</h1>
        <p className="mt-2 max-w-2xl text-slate-300">
          Verifiable escrow locked to the fingerprint verdict — same contract, same
          transaction. Live on StudioNet{" "}
          <code className="rounded bg-white/10 px-1 text-xs">{shortenAddress(CONTRACT_ADDRESS)}</code>.
        </p>

        {/* Flow explainer */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <FlowStep
            icon={<Coins className="h-5 w-5 text-indigo-300" />}
            step="1"
            title="Fund"
            body="Buyer calls create_task (payable). Stake >= min_stake is locked; task binds agent + attestation + payout address."
          />
          <FlowStep
            icon={<ShieldCheck className="h-5 w-5 text-cyan-300" />}
            step="2"
            title="Verify"
            body="verify_fingerprint() runs LLM consensus across validators and writes the verdict on-chain."
          />
          <FlowStep
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-300" />}
            step="3"
            title="Settle — atomically"
            body="Verdict lands in the same tx: MATCH → full stake to agent; MISMATCH → 80% buyer / 20% pool; INCONCLUSIVE → hold."
          />
        </div>

        {!address && (
          <p className="mt-5 rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-3 text-sm text-indigo-200">
            Wallet not connected. Balance and task lookups work without a wallet;
            funding a task or settling needs MetaMask / Rabby (top right).
          </p>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {/* Left column: state + lookup */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Card title="Contract balance (live)" action={<ReloadBtn onClick={balance.reload} />}>
                {balance.status === "loading" && <LoadingRow />}
                {balance.status === "error" && <ErrorRow msg={balance.error} />}
                {balance.status === "success" && balance.data && (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <Field k="contract_balance" v={`${balance.data.contract_balance} raw`} />
                    <Field k="total_locked" v={`${balance.data.total_locked} raw`} />
                    <Field k="min_stake" v={`${balance.data.min_stake} raw`} />
                    <Field k="appeal_fee" v={`${balance.data.appeal_fee ?? 0} raw`} />
                    <Field k="pool" v={truncate(balance.data.pool)} mono />
                    <Field k="library" v={balance.data.library_version ? `v${balance.data.library_version}` : "not committed"} />
                  </dl>
                )}
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }}>
              <Card title="Task lookup (live)">
                <div className="flex gap-2">
                  <input
                    value={lookupId}
                    onChange={(e) => setLookupId(e.target.value)}
                    placeholder="task-1"
                    className="h-10 w-full rounded-xl border border-white/10 bg-ink px-3 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <Button variant="outline" onClick={() => setLookedUp(lookupId.trim())} disabled={!lookupId.trim()}>
                    <Search className="h-4 w-4" /> Lookup
                  </Button>
                </div>

                <div className="mt-4">
                  {lookup.status === "idle" && <p className="text-sm text-slate-500">Enter a task id and press Lookup.</p>}
                  {lookup.status === "loading" && <LoadingRow />}
                  {lookup.status === "error" && <ErrorRow msg={lookup.error} />}
                  {lookup.status === "success" && lookup.data && <TaskCard task={lookup.data} />}
                </div>
              </Card>
            </motion.div>

            {/* Settlement rules reference */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }}>
              <Card title="Settlement rules">
                <ul className="space-y-2 text-sm text-slate-300">
                  <RuleRow
                    icon={<Unlock className="h-4 w-4 text-emerald-400" />}
                    label="MATCH"
                    desc="Full stake → agent_payout. Reputation +1."
                  />
                  <RuleRow
                    icon={<Slash className="h-4 w-4 text-red-400" />}
                    label="MISMATCH"
                    desc="80% stake → buyer, 20% → slash pool. Reputation −1."
                  />
                  <RuleRow
                    icon={<Lock className="h-4 w-4 text-amber-400" />}
                    label="INCONCLUSIVE"
                    desc="Stake stays locked; owner resolves manually via settle_task."
                  />
                </ul>
              </Card>
            </motion.div>
          </div>

          {/* Right column: create + owner controls */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <Card title="Fund a task (payable)">
                <div className="grid grid-cols-1 gap-3">
                  <label className="text-xs text-slate-400">
                    Task ID
                    <input
                      value={taskId}
                      onChange={(e) => setTaskId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-ink px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Agent ID (must be registered)
                    <input
                      value={agentId}
                      onChange={(e) => setAgentId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-ink px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Attestation ID (must exist &amp; be bound to the agent)
                    <input
                      value={attestationId}
                      onChange={(e) => setAttestationId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-ink px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Agent payout address (paid on MATCH)
                    <input
                      value={agentPayout}
                      onChange={(e) => setAgentPayout(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-ink px-3 font-mono text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Stake (raw atto-GEN units, ≥ min_stake)
                    <input
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      inputMode="numeric"
                      className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-ink px-3 font-mono text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                </div>
                <Button className="mt-4 w-full" disabled={disabled} onClick={onCreate}>
                  {wr.pending ? "Pending..." : "Fund task"}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
                <p className="mt-2 text-[11px] text-slate-500">
                  StudioNet is gasless. The stake is locked in the contract until the
                  verdict settles — either atomically in `verify_fingerprint` or via
                  owner `settle_task`.
                </p>
              </Card>
            </motion.div>

            {wr.error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
                {wr.error}{" "}
                <button className="underline" onClick={wr.clearError}>
                  dismiss
                </button>
              </div>
            )}

            <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.08 }}>
              <Card title="Owner controls (only owner wallet)">
                <div className="space-y-3">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={ownerTaskId}
                      onChange={(e) => setOwnerTaskId(e.target.value)}
                      placeholder="task-1"
                      className="h-10 rounded-xl border border-white/10 bg-ink px-3 text-sm outline-none focus:border-indigo-400"
                    />
                    <select
                      value={settleVerdict}
                      onChange={(e) => setSettleVerdict(e.target.value)}
                      className="h-10 rounded-xl border border-white/10 bg-ink px-2 text-sm outline-none focus:border-indigo-400"
                    >
                      <option value="MATCH">MATCH</option>
                      <option value="MISMATCH">MISMATCH</option>
                      <option value="INCONCLUSIVE">INCONCLUSIVE</option>
                    </select>
                  </div>
                  <Button variant="outline" className="w-full" disabled={disabled} onClick={onSettle}>
                    Manual settle_task
                  </Button>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={newMinStake}
                      onChange={(e) => setNewMinStake(e.target.value)}
                      inputMode="numeric"
                      placeholder="1000"
                      className="h-10 rounded-xl border border-white/10 bg-ink px-3 font-mono text-sm outline-none focus:border-indigo-400"
                    />
                    <Button variant="outline" disabled={disabled} onClick={onSetMinStake}>
                      set_min_stake
                    </Button>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={newPool}
                      onChange={(e) => setNewPool(e.target.value)}
                      placeholder="0x... slash pool recipient"
                      className="h-10 rounded-xl border border-white/10 bg-ink px-3 font-mono text-xs outline-none focus:border-indigo-400"
                    />
                    <Button variant="outline" disabled={disabled} onClick={onSetPool}>
                      set_pool
                    </Button>
                  </div>
                </div>

                <div className="mt-5 border-t border-white/5 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Appeal adjudication (INCONCLUSIVE review)
                  </p>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={appealAttId}
                      onChange={(e) => setAppealAttId(e.target.value)}
                      placeholder="attestation id, e.g. att-1"
                      className="h-10 rounded-xl border border-white/10 bg-ink px-3 text-sm outline-none focus:border-indigo-400"
                    />
                    <select
                      value={appealRuling}
                      onChange={(e) => setAppealRuling(e.target.value)}
                      className="h-10 rounded-xl border border-white/10 bg-ink px-2 text-sm outline-none focus:border-indigo-400"
                    >
                      <option value="MATCH">MATCH</option>
                      <option value="MISMATCH">MISMATCH</option>
                      <option value="INCONCLUSIVE">INCONCLUSIVE</option>
                    </select>
                  </div>
                  <input
                    value={appealNote}
                    onChange={(e) => setAppealNote(e.target.value)}
                    placeholder="adjudication note (max 512 chars)"
                    className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-ink px-3 text-xs outline-none focus:border-indigo-400"
                  />
                  <Button variant="outline" className="mt-2 w-full" disabled={disabled} onClick={onResolveAppeal}>
                    resolve_appeal (bond: decisive → appellant, INCONCLUSIVE → pool)
                  </Button>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function safeBigInt(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  try {
    return BigInt(t);
  } catch {
    return null;
  }
}

function TaskCard({ task }: { task: import("@/lib/contract-hooks").TaskInfo }) {
  const statusTone =
    task.status === "FUNDED"
      ? "text-indigo-300 border-indigo-400/30 bg-indigo-500/10"
      : task.status === "RELEASED"
        ? "text-emerald-300 border-emerald-400/30 bg-emerald-500/10"
        : task.status === "SLASHED"
          ? "text-red-300 border-red-400/30 bg-red-500/10"
          : "text-amber-300 border-amber-400/30 bg-amber-500/10";

  const payoutText =
    task.status === "RELEASED"
      ? `${task.stake} raw → ${task.agent_payout}`
      : task.status === "SLASHED"
        ? `80% → buyer, 20% → pool`
        : task.status === "HELD"
          ? "Locked pending owner review"
          : "Locked until verdict";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="font-mono text-xs text-slate-400">{task.task_id}</code>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusTone}`}>
          {task.status}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Field k="agent_id" v={task.agent_id} />
        <Field k="attestation_id" v={task.attestation_id} />
        <Field k="stake" v={`${task.stake} raw`} />
        <Field k="verdict" v={task.verdict || "-"} />
        <Field k="buyer" v={truncate(task.buyer)} mono />
        <Field k="agent_payout" v={truncate(task.agent_payout)} mono />
      </dl>
      <p className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3 text-xs text-slate-400">
        <ArrowRight className="h-3.5 w-3.5" /> Payout path: <span className="text-slate-200">{payoutText}</span>
      </p>
    </div>
  );
}

function FlowStep({
  icon,
  step,
  title,
  body,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="glass flex items-start gap-3 rounded-2xl border border-white/10 bg-panel/70 p-4">
      <div className="relative shrink-0">{icon}</div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Step {step}</p>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{body}</p>
      </div>
    </div>
  );
}

function RuleRow({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <strong className="text-slate-100">{label}</strong>
        <span className="text-slate-400"> — {desc}</span>
      </span>
    </li>
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
      <dd className={mono ? "break-all font-mono text-xs" : "break-all"}>{v}</dd>
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

function truncate(s: string) {
  if (!s) return "-";
  return s.length > 18 ? `${s.slice(0, 8)}...${s.slice(-6)}` : s;
}
