import { EPIX_CHAIN_ID, OSMOSIS_CHAIN_ID } from "./bridge";
import { PendingSwapTransaction, isPendingTransaction } from "./execution";

const transactionFields = new Set([
  "chainId",
  "hash",
  "confirmed",
  "direction",
  "packetSequence",
  "received",
  "failed",
  "submissionUnknown",
  "cancelled",
  "submissionAttempts",
]);

function validSubmissionAttempts(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  return Object.entries(value).every(
    ([key, state]) =>
      /^[a-zA-Z0-9-]{1,64}$/.test(key) &&
      (state === "unknown" || state === "cancelled")
  );
}

function validTransaction(value: unknown): value is PendingSwapTransaction {
  if (typeof value !== "object" || value === null) return false;
  if (!Object.keys(value).every((key) => transactionFields.has(key)))
    return false;
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
        /^[1-9]\d{0,19}$/.test(item.packetSequence))) &&
    (item.received === undefined || typeof item.received === "boolean") &&
    (item.failed === undefined || typeof item.failed === "boolean") &&
    (item.submissionUnknown === undefined ||
      typeof item.submissionUnknown === "boolean") &&
    (item.cancelled === undefined || typeof item.cancelled === "boolean") &&
    validSubmissionAttempts(item.submissionAttempts)
  );
}

function cloneTransaction(
  transaction: PendingSwapTransaction
): PendingSwapTransaction {
  return {
    ...transaction,
    submissionAttempts: transaction.submissionAttempts && {
      ...transaction.submissionAttempts,
    },
  };
}

function submissionAttempts(transaction: PendingSwapTransaction) {
  return (
    transaction.submissionAttempts ??
    (transaction.submissionUnknown || transaction.cancelled
      ? { legacy: "unknown" as const }
      : {})
  );
}

function normalizeCancellation(
  transaction: PendingSwapTransaction
): PendingSwapTransaction {
  const attempts = submissionAttempts(transaction);
  const states = Object.values(attempts);
  if (states.length === 0) return transaction;
  return {
    ...transaction,
    submissionAttempts: { ...attempts },
    cancelled:
      states.every((state) => state === "cancelled") &&
      transaction.submissionUnknown !== false &&
      !transaction.confirmed &&
      !transaction.received &&
      !transaction.failed,
  };
}

export function mergePendingTransaction(
  current: PendingSwapTransaction,
  update: PendingSwapTransaction
): PendingSwapTransaction {
  const attempts = { ...submissionAttempts(current) };
  for (const [id, state] of Object.entries(submissionAttempts(update))) {
    if (attempts[id] !== "cancelled") attempts[id] = state;
  }
  return normalizeCancellation({
    ...current,
    ...update,
    confirmed: current.confirmed || update.confirmed,
    received: current.received || update.received,
    failed: current.failed || update.failed,
    submissionAttempts: Object.keys(attempts).length > 0 ? attempts : undefined,
    submissionUnknown:
      current.submissionUnknown === false
        ? false
        : update.submissionUnknown ?? current.submissionUnknown,
    packetSequence: update.packetSequence ?? current.packetSequence,
  });
}

type JournalStorage = {
  read(owner: string): Promise<PendingSwapTransaction[]>;
  append(owner: string, transactions: PendingSwapTransaction[]): Promise<void>;
};

type ExtensionStorage = {
  get(keys: null | string[]): Promise<Record<string, unknown>>;
  getKeys?(): Promise<string[]>;
  set(items: Record<string, unknown>): Promise<void>;
};

const journalPrefix = "epix-swap-pending-v2/";

function transactionId(transaction: PendingSwapTransaction): string {
  return `${transaction.chainId}/${transaction.hash}`;
}

function mergeTransactions(
  transactions: PendingSwapTransaction[]
): PendingSwapTransaction[] {
  const merged = new Map<string, PendingSwapTransaction>();
  for (const transaction of transactions) {
    const key = transactionId(transaction);
    const previous = merged.get(key);
    merged.set(
      key,
      previous
        ? mergePendingTransaction(previous, transaction)
        : normalizeCancellation(cloneTransaction(transaction))
    );
  }
  return retainTransactions(Array.from(merged.values()));
}

function statusKey(transaction: PendingSwapTransaction): string {
  return JSON.stringify([
    transaction.confirmed,
    !!transaction.received,
    !!transaction.failed,
    !!transaction.cancelled,
    transaction.submissionUnknown ?? null,
    transaction.packetSequence ?? null,
    Object.entries(submissionAttempts(transaction)).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  ]);
}

/** Immutable public snapshots prevent another popup from erasing a hash or status. */
export function createPendingJournalStorage(
  storage: ExtensionStorage
): JournalStorage {
  return {
    async read(owner) {
      const prefix = `${journalPrefix}${encodeURIComponent(owner)}/`;
      const legacyKey = `epix-swap-pending/${owner}`;
      const keys = storage.getKeys
        ? (await storage.getKeys()).filter(
            (key) => key.startsWith(prefix) || key === legacyKey
          )
        : null;
      const items = await storage.get(keys);
      const legacy = items[legacyKey];
      const records = Array.isArray(legacy)
        ? legacy.filter(validTransaction)
        : [];
      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith(prefix) && validTransaction(value))
          records.push(value);
      }
      return mergeTransactions(records);
    },
    async append(owner, transactions) {
      const prefix = `${journalPrefix}${encodeURIComponent(owner)}/`;
      const records: Record<string, unknown> = {};
      for (const transaction of transactions) {
        const key = `${prefix}${transactionId(transaction)}/${statusKey(
          transaction
        )}`;
        records[key] = cloneTransaction(transaction);
      }
      if (Object.keys(records).length > 0) await storage.set(records);
    },
  };
}

export function createExtensionPendingTransactionStore(): PendingTransactionStore {
  return new PendingTransactionStore(
    createPendingJournalStorage(browser.storage.local)
  );
}

/** Fresh disk reads observe other views; failed post-dispatch saves remain in memory. */
export class PendingTransactionStore {
  private readonly values = new Map<string, PendingSwapTransaction[]>();
  private readonly writes = new Map<string, Promise<unknown>>();
  constructor(private readonly storage: JournalStorage) {}

  private async refresh(owner: string): Promise<PendingSwapTransaction[]> {
    const stored = await this.storage.read(owner);
    const transactions = mergeTransactions([
      ...(this.values.get(owner) ?? []),
      ...stored,
    ]);
    this.values.set(owner, transactions);
    return transactions;
  }

  async read(owner: string): Promise<PendingSwapTransaction[]> {
    await this.writes.get(owner)?.catch(() => undefined);
    return (await this.refresh(owner)).map(cloneTransaction);
  }

  merge(
    owner: string,
    updates: PendingSwapTransaction[],
    requirePersistence = false
  ): Promise<PendingSwapTransaction[]> {
    if (!updates.every(validTransaction))
      return Promise.reject(new TypeError("Invalid pending transaction"));
    const snapshots = updates.map(cloneTransaction);
    const write = (this.writes.get(owner) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        let current = this.values.get(owner) ?? [];
        try {
          current = await this.refresh(owner);
        } catch (error) {
          if (requirePersistence) throw error;
        }
        const transactions = mergeTransactions([...current, ...snapshots]);
        try {
          await this.storage.append(owner, snapshots);
        } catch (error) {
          if (requirePersistence) throw error;
          /* After dispatch, storage failure cannot change the network outcome. */
        }
        this.values.set(owner, transactions);
        return transactions.map(cloneTransaction);
      });
    this.writes.set(owner, write);
    return write;
  }
}

function retainTransactions(
  transactions: PendingSwapTransaction[]
): PendingSwapTransaction[] {
  return [
    ...transactions.filter(isPendingTransaction),
    ...transactions
      .filter((transaction) => !isPendingTransaction(transaction))
      .slice(-20),
  ];
}
