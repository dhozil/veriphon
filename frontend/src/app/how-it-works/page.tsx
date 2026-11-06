"use client";

import { motion } from "framer-motion";
import { ArrowRight, AudioLines, Scale, ShieldCheck, UserCog } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: UserCog,
    title: "1. Agent claims a model",
    body: "An agent registers its claimed model + version + endpoint commitment hash. The claim is frozen and SHA-256 hash-bound. Fails closed: any mismatch returns false.",
  },
  {
    icon: AudioLines,
    title: "2. Off-chain transcript collection",
    body: "A collector calls the agent API with held-private API keys (API keys never go on-chain) and submits a transcript plus its SHA-256. The contract rejects any hash mismatch before consensus even starts.",
  },
  {
    icon: Scale,
    title: "3. Validator consensus",
    body: "genlayer-js leader proposes a per-probe boolean bit-vector; independent validators re-derive the same vector from the same transcript + rubric (run_nondet_unsafe). Critical bits must match exactly; advisory bits allow tolerance 1. Verdict is derived deterministically in Python - the model never votes.",
  },
  {
    icon: ShieldCheck,
    title: "4. Settle on-chain",
    body: "Verdict is MATCH, MISMATCH or INCONCLUSIVE (never a binary guess). is_verified() is fail-closed. Reputation moves only on MATCH/MISMATCH. Escrow hooks follow in v0.2.",
  },
];

export default function HowItWorks() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/4 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl float-slow" />
        <div className="absolute top-96 right-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl float-slow-2" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-gradient text-4xl font-bold tracking-tight md:text-5xl">How it works</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Veriphon adjudicates black-box behavioral fingerprints with
          decentralized validators. No model weights, no single server verdict.
        </p>

        <div className="mt-10 space-y-4">
          {STEPS.map((s, i) => (
            <motion.article
              key={s.title}
              initial={{ opacity: 0, x: -24, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="glass group rounded-2xl p-5 transition-colors hover:border-indigo-400/30 hover:bg-white/[0.06]"
            >
              <div className="flex items-start gap-4">
                <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-cyan-500/20 text-indigo-300 ring-1 ring-indigo-400/20 transition-transform duration-300 group-hover:scale-110">
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-white">{s.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">{s.body}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-10 rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 to-cyan-500/5 p-5 text-sm"
        >
          <p className="font-semibold text-indigo-200">Honest limits</p>
          <p className="mt-1 text-slate-300">
            This is behavioral evidence, not cryptographic proof of model weights.
            That is why verdicts are 3-state, and INCONCLUSIVE exists. Anything
            else would be false precision.
          </p>
        </motion.div>

        <Link href="/verify" className="mt-8 inline-block">
          <Button size="lg" className="gap-2">
            Verify against the live contract <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}
