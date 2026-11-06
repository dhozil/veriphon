"use client";

import { motion } from "framer-motion";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFingerprintLibrary, useProbeBank } from "@/lib/contract-hooks";

export default function RubricPage() {
  const bank = useProbeBank();
  const library = useFingerprintLibrary();

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/3 h-80 w-80 rounded-full bg-indigo-500/12 blur-3xl float-slow" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-14">
        <h1 className="text-gradient text-4xl font-bold tracking-tight md:text-5xl">Rubric</h1>
        <p className="mt-2 max-w-2xl text-slate-300">
          The live probe bank, read from the contract. Every verdict is bound to
          this rubric hash - change the rubric, flip the version, and old
          attestations stop counting.
        </p>

        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="glass mt-8 rounded-2xl border border-white/10 bg-panel/80 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400" />
              Probe bank (live)
            </h2>
            <Button variant="ghost" size="sm" onClick={bank.reload}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {bank.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-300" /> Loading...
            </p>
          )}
          {bank.status === "error" && (
            <p className="text-sm text-red-300" role="alert">
              {bank.error}
            </p>
          )}
          {bank.status === "success" && bank.data && (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-[11px] uppercase tracking-widest text-slate-500">version</dt>
                  <dd className="text-white">{String(bank.data.version)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-widest text-slate-500">tolerance</dt>
                  <dd className="text-white">{String(bank.data.advisory_tolerance)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-widest text-slate-500">hash</dt>
                  <dd className="font-mono text-xs break-all text-indigo-200">{bank.data.rubric_hash}</dd>
                </div>
              </dl>
              <pre className="mt-4 overflow-auto rounded-xl bg-ink p-3 text-xs leading-relaxed text-slate-200 ring-1 ring-white/5">
                {bank.data.rubric_json}
              </pre>
              <p className="mt-2 text-xs text-slate-500">
                Critical probes (reasoning, knowledge) must match validator votes
                exactly. Advisory probes (style) allow ±1. Verdict math is
                deterministic Python, not LLM opinion.
              </p>
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="glass mt-6 rounded-2xl border border-white/10 bg-panel/80 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400" />
              Reference fingerprint library (live)
            </h2>
            <Button variant="ghost" size="sm" onClick={library.reload}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {library.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> Loading...
            </p>
          )}
          {library.status === "error" && (
            <p className="text-sm text-red-300" role="alert">
              {library.error}
            </p>
          )}
          {library.status === "success" && library.data && (
            <>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-widest text-slate-500">version</dt>
                  <dd className="text-white">{String(library.data.version)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-widest text-slate-500">sha256 commitment</dt>
                  <dd className="break-all font-mono text-xs text-cyan-200">{library.data.hash || "- not committed yet"}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Commits the verifier to the off-chain reference fingerprint library
                (per-model-family behavioral fingerprints used for calibration).
                Owner bumps the version + hash when the library changes; old
                commitments remain auditable via transaction history.
              </p>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}
