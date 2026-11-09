// StudioNet deploy address (see ../../deployments.json at project root)
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0xf8B8b9bDc0Eed21E96cB443e15F36414962b570F";

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer-studio.genlayer.com/";

export const DEMO_AGENT_ID = "agent-1";
export const DEMO_ATTESTATION_ID = "att-1";

export function shortenAddress(a: string): string {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export async function sha256HexAsync(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

