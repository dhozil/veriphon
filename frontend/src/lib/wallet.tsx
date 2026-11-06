"use client";

// Single-connect wallet: exactly one eth_requestAccounts call per user click.
// No polling, no chainChanged listeners on mount, no popup on page load.
// MetaMask + Rabby both expose the same EIP-1193 window.ethereum, so we only
// ever talk to ONE provider object. Never create two clients.

import * as React from "react";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

type WalletState = {
  address: string | null;
  connecting: boolean;
  error: string | null;
  providerName: string | null;
  client: ReturnType<typeof createClient> | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
};

const WalletCtx = React.createContext<WalletState | null>(null);

function detectWalletName(
  eth: { isMetaMask?: boolean; isRabby?: boolean } | undefined
): string | null {
  if (!eth) return null;
  if (eth.isRabby) return "Rabby";
  if (eth.isMetaMask) return "MetaMask";
  return "EVM wallet";
}

function getInjected(): { isMetaMask?: boolean; isRabby?: boolean } | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: never }).ethereum;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [providerName, setProviderName] = React.useState<string | null>(null);
  const [client, setClient] = React.useState<ReturnType<typeof createClient> | null>(null);

  const connect = React.useCallback(async () => {
    setError(null);
    const eth = getInjected();
    if (!eth) {
      setError("No EVM wallet detected. Install MetaMask or Rabby, then reload this page.");
      return;
    }
    setConnecting(true);
    try {
      // Single call. Do NOT call twice. Do NOT add listeners here.
      // genlayer-js 1.1.8: provider + account address is enough; connect() is
      // for MetaMask Snap, not needed for EIP-1193 signing.
      const accounts = (await (eth as unknown as {
        request: (a: { method: string }) => Promise<string[]>;
      }).request({ method: "eth_requestAccounts" })) as string[];
      const acc = accounts?.[0];
      if (!acc) {
        setError("Wallet returned no accounts. Unlock your wallet and try again.");
        return;
      }
      const c = createClient({
        chain: studionet,
        account: acc as `0x${string}`,
        provider: eth as unknown as never,
      });
      setClient(c);
      setAddress(acc);
      setProviderName(detectWalletName(eth));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 4001 = user rejected. Do not retry automatically.
      if (msg.toLowerCase().includes("user denied") || msg.includes("4001")) {
        setError("Connection rejected in wallet. Click Connect again when you are ready.");
      } else {
        setError(msg);
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = React.useCallback(() => {
    // genlayer-js has no disconnect. Clear local state only.
    setClient(null);
    setAddress(null);
    setProviderName(null);
    setError(null);
  }, []);

  const value: WalletState = {
    address,
    connecting,
    error,
    providerName,
    client,
    connect,
    disconnect,
    clearError: () => setError(null),
  };

  return React.createElement(WalletCtx.Provider, { value }, children);
}

export function useWallet(): WalletState {
  const v = React.useContext(WalletCtx);
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
  return v;
}

/** Read-only client: no wallet needed. Reads work without signing. */
export function useReadClient() {
  const { client } = useWallet();
  return React.useMemo(() => {
    if (client) return client;
    return createClient({ chain: studionet });
  }, [client]);
}
