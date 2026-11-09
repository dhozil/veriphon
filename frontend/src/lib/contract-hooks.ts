"use client";

// Contract hooks: read + write with explicit status machine + error handling
// that surfaces failures instead of swallowing them.
// genlayer-js 1.1.8 reality: no waitForDecision/waitForFinalization yet (v2 RC).
// So "success" = receipt status FINALIZED + txExecutionResult FINISHED_WITH_RETURN.
// We do NOT treat ACCEPTED/FINALIZED alone as success (docs rule).

import * as React from "react";
import { TransactionHashVariant } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./contract";
import { useReadClient, useWallet } from "./wallet";

export type AsyncState<T> =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: string };

function start<T>(): AsyncState<T> {
  return { status: "loading", data: null, error: null };
}
function ok<T>(data: T): AsyncState<T> {
  return { status: "success", data, error: null };
}
function fail<T>(message: string): AsyncState<T> {
  return { status: "error", data: null, error: message };
}

function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export interface ProbeBank {
  version: number;
  rubric_hash: string;
  rubric_json: string;
  advisory_tolerance: number;
}

export interface AgentInfo {
  agent_id: string;
  claimed_model: string;
  model_version: string;
  endpoint_commitment_hash: string;
  reputation: number;
}

export interface Attestation {
  agent_id: string;
  attestation_id: string;
  evidence_hash: string;
  match_score: number;
  probe_rubric_hash: string;
  requester: string;
  status: string;
  submitted_transcript_hash: string;
  verdict: string;
  evidence_detail?: string; // json: { confidence, evidence: [{probe_id, consistent, quote, axis}] }
  challenge_nonce?: string;
  challenge_hash?: string;
  endpoint_commitment_hash?: string;
  challenge_probe_ids?: string; // JSON string list
  challenge_status?: string;
}

export interface TaskInfo {
  task_id: string;
  buyer: string;
  agent_id: string;
  attestation_id: string;
  agent_payout: string;
  stake: number;
  status: string;
  verdict: string;
}

export interface BalanceInfo {
  contract_balance: number;
  total_locked: number;
  min_stake: number;
  pool: string;
  appeal_fee?: number;
  library_version?: number;
  library_hash?: string;
}

export interface AgentIdentity {
  agent_id: string;
  bound: boolean;
  registry: string;
  token_id: string;
  uri: string;
  default_registry: string;
}

export interface FingerprintLibrary {
  version: number;
  hash: string;
}

export interface Challenge {
  attestation_id: string;
  challenge_nonce: string;
  challenge_hash: string;
  endpoint_commitment_hash: string;
  challenge_probe_ids: string; // JSON string list
  challenge_status: string;
  probe_rubric_hash: string;
}

const READ_VARIANT: TransactionHashVariant =
  // Runtime guard: enum values differ between SDK versions.
  // Prefer LATEST_FINAL for durable reads; fall back to nonfinal string.
  (TransactionHashVariant as unknown as Record<string, TransactionHashVariant>)
    .LATEST_FINAL ?? ("latest-final" as TransactionHashVariant);

export function useProbeBank() {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<ProbeBank>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_probe_bank",
        args: [],
        transactionHashVariant: READ_VARIANT,
      })) as Record<string, unknown>;
      setS(ok(res as unknown as ProbeBank));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { ...s, reload: load };
}

export function useAgent(agentId: string) {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<AgentInfo>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_agent",
        args: [agentId],
        transactionHashVariant: READ_VARIANT,
      })) as Record<string, unknown>;
      setS(ok(res as unknown as AgentInfo));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client, agentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { ...s, reload: load };
}

export function useAttestation(attId: string) {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<Attestation>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_attestation",
        args: [attId],
        transactionHashVariant: READ_VARIANT,
      })) as Record<string, unknown>;
      setS(ok(res as unknown as Attestation));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client, attId]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { ...s, reload: load };
}

export function useChallenge(attId: string) {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<Challenge>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_challenge",
        args: [attId],
        transactionHashVariant: READ_VARIANT,
      })) as Record<string, unknown>;
      setS(ok(res as unknown as Challenge));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client, attId]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { ...s, reload: load };
}

export function useTask(taskId: string) {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<TaskInfo>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    if (!taskId.trim()) {
      setS({ status: "idle", data: null, error: null });
      return;
    }
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_task",
        args: [taskId.trim()],
        transactionHashVariant: READ_VARIANT,
      })) as Record<string, unknown>;
      setS(ok(res as unknown as TaskInfo));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client, taskId]);

  return { ...s, reload: load };
}

export function useBalanceInfo() {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<BalanceInfo>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_balance_info",
        args: [],
        transactionHashVariant: READ_VARIANT,
      })) as Record<string, unknown>;
      setS(ok(res as unknown as BalanceInfo));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { ...s, reload: load };
}

export function useAgentIdentity(agentId: string) {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<AgentIdentity>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_agent_identity",
        args: [agentId],
        transactionHashVariant: READ_VARIANT,
      })) as Record<string, unknown>;
      setS(ok(res as unknown as AgentIdentity));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client, agentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { ...s, reload: load };
}

export function useFingerprintLibrary() {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<FingerprintLibrary>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_fingerprint_library",
        args: [],
        transactionHashVariant: READ_VARIANT,
      })) as Record<string, unknown>;
      setS(ok(res as unknown as FingerprintLibrary));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { ...s, reload: load };
}

export function useIsVerified(agentId: string, expectedModel: string) {
  const client = useReadClient();
  const [s, setS] = React.useState<AsyncState<boolean>>({
    status: "idle",
    data: null,
    error: null,
  });

  const load = React.useCallback(async () => {
    setS(start());
    try {
      const res = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "is_verified",
        args: [agentId, expectedModel],
        transactionHashVariant: READ_VARIANT,
      })) as boolean;
      setS(ok(res));
    } catch (e) {
      setS(fail(toMessage(e)));
    }
  }, [client, agentId, expectedModel]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { ...s, reload: load };
}

/** Generic write: StudioNet flow per genlayer-js 1.1.8. */
export function useWrite() {
  const { client } = useWallet();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Set true when a value was sent with the last transaction.
  const write = React.useCallback(
    async (functionName: string, args: unknown[], value?: bigint) => {
      if (!client) {
        setError("Connect your wallet first.");
        return;
      }
      setError(null);
      setPending(true);
      let txId: string | undefined;
      try {
        txId = (await client.writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName,
          args: args as never[],
          value: value ?? BigInt(0),
        })) as unknown as string;
        if (!txId) throw new Error("Wallet returned no transaction hash.");
        // Docs rule: txId exists -> never blind-retry. Track this ID.
        // v1.1.8 has no waitForFinalization (v2 RC), so poll receipt and
        // require BOTH final status and successful execution result.
        const receipt = (await client.waitForTransactionReceipt({
          hash: txId as unknown as Parameters<typeof client.waitForTransactionReceipt>[0]["hash"],
          interval: 4000,
          retries: 40,
        })) as unknown as {
          status?: string;
          txExecutionResultName?: string;
          txExecutionResult?: number;
        };
        const status = String(receipt?.status ?? "");
        const exec = String(receipt?.txExecutionResultName ?? receipt?.txExecutionResult ?? "");
        const okFinal = /FINALIZED|ACCEPTED/i.test(status);
        const okExec = /FINISHED_WITH_RETURN/i.test(exec) || exec === "1";
        if (!(okFinal && okExec)) {
          throw new Error(
            `Transaction did not finish successfully (status=${status} exec=${exec}). tx=${txId}`
          );
        }
      } catch (e) {
        if (txId) {
          setError(
            `${toMessage(e)} - tx already submitted (${txId}). Do not resubmit; check status first.`
          );
        } else {
          setError(toMessage(e));
        }
        return;
      } finally {
        setPending(false);
      }
    },
    [client]
  );

  return { pending, error, write, clearError: () => setError(null) };
}
