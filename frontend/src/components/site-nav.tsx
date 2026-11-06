"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletButton } from "./wallet-button";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/verify", label: "Verify" },
  { href: "/escrow", label: "Escrow" },
  { href: "/rubric", label: "Rubric" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#05070d]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="group flex items-center gap-2 font-semibold tracking-tight text-white">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-transform duration-300 group-hover:scale-110">
            <AudioLines className="h-5 w-5 text-white" />
          </span>
          Veriphon
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-all duration-300",
                pathname === l.href
                  ? "bg-gradient-to-r from-indigo-500/20 to-cyan-500/10 text-white ring-1 ring-indigo-400/20"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <WalletButton />
        </div>
      </div>
      {/* mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-3 sm:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-all",
              pathname === l.href
                ? "bg-indigo-500/20 text-white ring-1 ring-indigo-400/20"
                : "text-slate-300 hover:text-white"
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
