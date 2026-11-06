"use client";

// HD ProgressiveHero (v2): %m2%xcd%B0%29crop
// indigo-cyan-purple gradient system
// parallax image layer + film grain + soft bokeh
// smooth spring animations (left entry + soft blur)
// transparent navbar per frame (coordinated by parent SiteNav replacement)

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { MoveRight, ScanSearch, ShieldCheck, GitBranch, Zap, HandCoins, AudioLines } from "lucide-react";
import { Button } from "./button";

function ProgressiveHero() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(() => ["verified", "adjudicated", "settled"], []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (titleNumber === titles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const titleY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <div ref={ref} className="relative flex min-h-screen w-full flex-col font-sans hero-bg overflow-hidden">
      {/* Parallax cinematic image layer */}
      <motion.div
        style={{ y: imageY }}
        className="hero-image absolute inset-0 h-[130%] w-full opacity-40"
      />
      {/* Overlay gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#05070d]/70 via-[#05070d]/40 to-[#05070d]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(129,140,248,0.18),transparent_55%)]" />
      {/* Subtle grid overlay */}
      <div className="grid-overlay absolute inset-0 opacity-60" />
      {/* Film grain */}
      <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')]" />

      {/* Floating bokeh orbs */}
      <div className="absolute top-[15%] left-[8%] h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl float-slow" />
      <div className="absolute bottom-[20%] right-[10%] h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl float-slow-2" />
      <div className="absolute top-1/2 left-[70%] h-48 w-48 rounded-full bg-purple-500/15 blur-3xl float-slow" style={{ animationDelay: "-2s" }} />

      {/* Glass navbar overlay (fades on scroll) - decorative top strip */}
      <div className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-6">
        <div className="flex items-center gap-2">
          <AudioLines className="h-5 w-5 text-indigo-300" />
          <span className="text-sm font-semibold tracking-tight text-white/90">Veriphon</span>
        </div>
        <span className="glass hidden rounded-full px-3 py-1 text-xs text-slate-300 sm:block">
          StudioNet · Live consensus
        </span>
      </div>

      <div className="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-4">
        <motion.div
          style={{ y: titleY, opacity: titleOpacity }}
          className="flex w-full max-w-3xl flex-col items-center justify-center gap-8 py-24 lg:py-32"
        >
          <motion.div
            initial={{ opacity: 0, x: -40, filter: "blur(6px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href="/how-it-works">
              <Button variant="secondary" size="sm" className="gap-4 glass">
                How consensus proves a model <MoveRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -50, filter: "blur(8px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-4"
          >
            <h1 className="text-center font-sans text-6xl font-extrabold tracking-tight text-white md:text-[84px] leading-[0.95]">
              <span className="text-slate-200">Prove which model</span>
              <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-6 md:pt-2">
                &nbsp;
                {titles.map((title, index) => (
                  <motion.span
                    key={title}
                    className="absolute font-extrabold tracking-tight text-gradient-animated"
                    initial={{ opacity: 0, y: "-100%", filter: "blur(4px)" }}
                    transition={{ type: "spring", stiffness: 50, damping: 20 }}
                    animate={
                      titleNumber === index
                        ? { y: 0, opacity: 1, filter: "blur(0px)" }
                        : { y: titleNumber > index ? -150 : 150, opacity: 0, filter: "blur(4px)" }
                    }
                  >
                    {title}
                  </motion.span>
                ))}
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, x: -40, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-2xl text-center text-lg md:text-xl leading-relaxed tracking-tight text-slate-300"
            >
              Veriphon is the neutral adjudication layer for agent-to-agent
              commerce. Validators independently check behavioral evidence
              against the claimed model and settle MATCH, MISMATCH, or
              INCONCLUSIVE on-chain.
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -40, filter: "blur(6px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-row flex-wrap justify-center gap-3"
          >
            <Link href="/verify">
              <Button size="lg" className="gap-4 pulse-glow">
                <ScanSearch className="h-4 w-4" /> Run a verification
              </Button>
            </Link>
            <Link href="/escrow">
              <Button size="lg" variant="secondary" className="gap-4 glass">
                <HandCoins className="h-4 w-4" /> Open escrow
              </Button>
            </Link>
          </motion.div>

          {/* Feature strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="grid w-full max-w-2xl grid-cols-3 gap-3 pt-6"
          >
            {[
              { icon: GitBranch, label: "Bit-vector quorum" },
              { icon: ShieldCheck, label: "Fail-closed gate" },
              { icon: Zap, label: "No oracle trust" },
            ].map((f) => (
              <div key={f.label} className="glass rounded-xl p-3 text-center">
                <f.icon className="mx-auto h-5 w-5 text-indigo-300" />
                <span className="mt-2 block text-[11px] uppercase tracking-widest text-slate-400">
                  {f.label}
                </span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export { ProgressiveHero };
