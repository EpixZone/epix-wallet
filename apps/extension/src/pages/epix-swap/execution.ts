import { Hash } from "@keplr-wallet/crypto";
import { Buffer } from "buffer/";
import { BroadcastMode, Keplr } from "@keplr-wallet/types";
import {
  EPIX_CHAIN_ID,
  EpixBridgeDirection,
  EpixBridgeEndpoints,
  getEpixBridgePacketSequence,
  getEpixBridgePacketStatus,
} from "./bridge";

export function guardedBroadcast({
  chainId,
  expiresAt,
  isCurrent,
  getProvider,
  beforeBroadcast,
  onNotBroadcast,
}: {
  chainId: string;
  expiresAt: number;
  isCurrent: () => boolean;
  getProvider: () => Promise<Pick<Keplr, "sendTx"> | undefined>;
  beforeBroadcast: (hash: string) => Promise<void>;
  onNotBroadcast?: (hash: string) => Promise<void>;
}) {
  return async (
    requestedChain: string,
    tx: Uint8Array,
    mode: BroadcastMode
  ): Promise<Uint8Array> => {
    const provider = await getProvider();
    // Signing is asynchronous. Recheck after approval, immediately before send.
    if (
      !provider ||
      requestedChain !== chainId ||
      !isCurrent() ||
      Date.now() >= expiresAt
    )
      throw new Error(
        "Transaction review expired or the selected account changed. Review again."
      );
    const hash = Buffer.from(Hash.sha256(tx)).toString("hex").toUpperCase();
    // Persist only the public hash before network dispatch. If this page closes
    // during sendTx, the next page can check that exact transaction safely.
    await beforeBroadcast(hash);
    if (!isCurrent() || Date.now() >= expiresAt) {
      await onNotBroadcast?.(hash);
      throw new Error(
        "Transaction review expired or the selected account changed. Review again."
      );
    }
    return provider.sendTx(requestedChain, tx, mode);
  };
}

export type PendingSwapTransaction = {
  chainId: string;
  hash: string;
  confirmed: boolean;
  direction?: EpixBridgeDirection;
  packetSequence?: string;
  received?: boolean;
  failed?: boolean;
  submissionUnknown?: boolean;
  submissionAttempts?: Record<string, "unknown" | "cancelled">;
  cancelled?: boolean;
};

export async function refreshPendingTransaction(
  transaction: PendingSwapTransaction,
  endpoints: EpixBridgeEndpoints,
  signal: AbortSignal
): Promise<PendingSwapTransaction> {
  if (
    transaction.cancelled ||
    transaction.received ||
    transaction.failed ||
    (transaction.confirmed && !transaction.direction)
  )
    return transaction;
  let next = transaction.confirmed
    ? transaction
    : await lookupSourceTransaction(transaction, endpoints, signal);
  if (next.direction && next.packetSequence && !next.failed) {
    const status = await getEpixBridgePacketStatus(
      next.direction,
      next.packetSequence,
      signal,
      endpoints
    );
    if (status === "received") next = { ...next, received: true };
  }
  return next;
}

async function lookupSourceTransaction(
  transaction: PendingSwapTransaction,
  endpoints: EpixBridgeEndpoints,
  signal: AbortSignal
): Promise<PendingSwapTransaction> {
  const endpoint =
    transaction.chainId === EPIX_CHAIN_ID ? endpoints.epix : endpoints.osmosis;
  const response = await fetchTransactionStatus(
    `${endpoint.replace(/\/$/, "")}/cosmos/tx/v1beta1/txs/${transaction.hash}`,
    signal
  );
  if (response.status === 404) return transaction;
  if (!response.ok) throw new Error("Transaction status unavailable");
  const data = response.data;
  const result = data?.tx_response;
  if (
    result?.txhash?.toUpperCase() !== transaction.hash ||
    !Number.isSafeInteger(result.code)
  )
    throw new TypeError("Invalid transaction status");
  return {
    ...transaction,
    confirmed: true,
    submissionUnknown: false,
    failed: result.code !== 0,
    packetSequence: transaction.direction
      ? getEpixBridgePacketSequence(transaction.direction, result.events ?? [])
      : undefined,
  };
}

async function fetchTransactionStatus(
  url: string,
  signal: AbortSignal
): Promise<{ status: number; ok: boolean; data?: any }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    const data = response.ok ? await response.json() : undefined;
    return { status: response.status, ok: response.ok, data };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export function isPendingTransaction(
  transaction: PendingSwapTransaction
): boolean {
  if (transaction.cancelled || transaction.failed || transaction.received)
    return false;
  return !transaction.confirmed || !!transaction.direction;
}
