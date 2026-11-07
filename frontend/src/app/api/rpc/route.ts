import { NextRequest, NextResponse } from "next/server";

// Server-side JSON-RPC proxy for GenLayer Studio RPC.
// Why: https://studio.genlayer.com/api does not return CORS headers, so any
// browser-side fetch (e.g. genlayer-js readContract) is blocked on Vercel.
// Reads must be proxied through the Next.js server, where CORS does not apply.
export const dynamic = "force-dynamic";

const DEFAULT_RPC = "https://studio.genlayer.com/api";

function rpcUrl(): string {
  return (
    process.env.GENLAYER_RPC_URL ??
    process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ??
    DEFAULT_RPC
  );
}

export async function GET() {
  return NextResponse.json({ ok: true, proxied: true });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (e) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: `Proxy fetch failed: ${String(e).slice(0, 200)}` },
      },
      { status: 502 }
    );
  }
  const text = await upstream.text();
  try {
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
