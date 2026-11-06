import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Veriphon - The truth layer for agentic commerce",
  description:
    "Prove which model an agent is actually running. GenLayer validator consensus adjudicates behavioral evidence and settles MATCH, MISMATCH or INCONCLUSIVE on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-slate-50 antialiased">
        <WalletProvider>
          <SiteNav />
          <main>{children}</main>
          <footer className="border-t border-white/10 py-8 text-center text-sm text-slate-400">
            Veriphon - The truth layer for agentic commerce. Verdicts are behavioral,
            probabilistic evidence - not cryptographic proof.
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
