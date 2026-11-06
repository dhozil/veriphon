"use client";

import { LogOut, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { shortenAddress } from "@/lib/contract";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { address, connecting, error, providerName, connect, disconnect, clearError } =
    useWallet();

  if (!address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button onClick={connect} disabled={connecting} size="sm" className="gap-2">
          <Wallet className="h-4 w-4" />
          {connecting ? "Waiting for wallet..." : "Connect wallet"}
        </Button>
        {error && (
          <p className="max-w-64 text-right text-xs text-red-400" role="alert">
            {error}{" "}
            <button className="underline" onClick={clearError}>
              dismiss
            </button>
          </p>
        )}
        <p className="text-[11px] text-slate-500">MetaMask / Rabby · single prompt, no popups on load</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-slate-400 sm:block">
        {providerName} · {shortenAddress(address)}
      </span>
      <Button variant="outline" size="sm" onClick={disconnect} className="gap-2">
        <LogOut className="h-4 w-4" />
        {shortenAddress(address)}
      </Button>
    </div>
  );
}
