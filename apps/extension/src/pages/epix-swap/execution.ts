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
}: {
  chainId: string;
  expiresAt: number;
  isCurrent: () => boolean;
  getProvider: () => Promise<Pick<Keplr, "sendTx"> | undefined>;
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
};

export async function refreshPendingTransaction(
  transaction: PendingSwapTransaction,
  endpoints: EpixBridgeEndpoints,
  signal: AbortSignal
): Promise<PendingSwapTransaction> {
  if (
    transaction.received ||
    transaction.failed ||
    (transaction.confirmed && !transaction.direction)
  )
    return transaction;
  let next = transaction;
  if (!transaction.confirmed) {
    const endpoint =
      transaction.chainId === EPIX_CHAIN_ID
        ? endpoints.epix
        : endpoints.osmosis;
    const response = await fetch(
      `${endpoint.replace(/\/$/, "")}/cosmos/tx/v1beta1/txs/${
        transaction.hash
      }`,
      { signal, cache: "no-store" }
    );
    if (response.status === 404) return transaction;
    if (!response.ok) throw new Error("Transaction status unavailable");
    const data = await response.json();
    const result = data?.tx_response;
    if (
      result?.txhash?.toUpperCase() !== transaction.hash ||
      !Number.isSafeInteger(result.code)
    )
      throw new TypeError("Invalid transaction status");
    next = {
      ...transaction,
      confirmed: true,
      failed: result.code !== 0,
      packetSequence: transaction.direction
        ? getEpixBridgePacketSequence(
            transaction.direction,
            result.events ?? []
          )
        : undefined,
    };
  }
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
