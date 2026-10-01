import { KVStore } from "@keplr-wallet/common";
import { EPIX_CHAIN_ID, OSMOSIS_CHAIN_ID } from "./bridge";
import { PendingSwapTransaction } from "./execution";

function validTransaction(value: unknown): value is PendingSwapTransaction {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<PendingSwapTransaction>;
  return (
    (item.chainId === EPIX_CHAIN_ID || item.chainId === OSMOSIS_CHAIN_ID) &&
    typeof item.hash === "string" &&
    item.hash.length === 64 &&
    /^[A-F0-9]+$/.test(item.hash) &&
    typeof item.confirmed === "boolean" &&
    (item.direction === undefined ||
      item.direction === "deposit" ||
      item.direction === "withdraw") &&
    (item.packetSequence === undefined ||
      (typeof item.packetSequence === "string" &&
        item.packetSequence.trim() === item.packetSequence &&
        /^[1-9][0-9]{0,19}$/.test(item.packetSequence))) &&
    (item.received === undefined || typeof item.received === "boolean") &&
    (item.failed === undefined || typeof item.failed === "boolean")
  );
}

export function mergePendingTransaction(
  current: PendingSwapTransaction,
  update: PendingSwapTransaction
): PendingSwapTransaction {
  return {
    ...current,
    ...update,
    confirmed: current.confirmed || update.confirmed,
    received: current.received || update.received,
    failed: current.failed || update.failed,
    packetSequence: update.packetSequence ?? current.packetSequence,
  };
}

/** Public transaction tracking. Queued writes cannot race asynchronous hydration. */
export class PendingTransactionStore {
  private readonly values = new Map<string, PendingSwapTransaction[]>();
  private readonly loads = new Map<string, Promise<PendingSwapTransaction[]>>();
  private readonly writes = new Map<string, Promise<unknown>>();
  constructor(private readonly storage: Pick<KVStore, "get" | "set">) {}

  private hydrate(owner: string): Promise<PendingSwapTransaction[]> {
    const existing = this.values.get(owner);
    if (existing) return Promise.resolve(existing);
    const pending = this.loads.get(owner);
    if (pending) return pending;
    const load = this.storage
      .get<unknown>(owner)
      .then((value) =>
        Array.isArray(value) ? value.filter(validTransaction).slice(-20) : []
      )
      .catch(() => [])
      .then((transactions) => {
        this.values.set(owner, transactions);
        return transactions;
      });
    this.loads.set(owner, load);
    return load;
  }

  async read(owner: string): Promise<PendingSwapTransaction[]> {
    await this.writes.get(owner);
    return this.hydrate(owner);
  }

  merge(
    owner: string,
    updates: PendingSwapTransaction[]
  ): Promise<PendingSwapTransaction[]> {
    const write = (this.writes.get(owner) ?? Promise.resolve()).then(
      async () => {
        const current = await this.hydrate(owner);
        const next = new Map(current.map((item) => [item.hash, item]));
        for (const item of updates) {
          const previous = next.get(item.hash);
          next.set(
            item.hash,
            previous ? mergePendingTransaction(previous, item) : item
          );
        }
        const transactions = Array.from(next.values()).slice(-20);
        this.values.set(owner, transactions);
        try {
          await this.storage.set(owner, transactions);
        } catch {
          /* A persistence failure must never turn a broadcast into a failure. */
        }
        return transactions;
      }
    );
    this.writes.set(owner, write);
    return write;
  }
}
