import {
  createPendingJournalStorage,
  PendingTransactionStore,
} from "./pending";
import { PendingSwapTransaction } from "./execution";

const transaction: PendingSwapTransaction = {
  chainId: "epix_1916-1",
  hash: "A".repeat(64),
  confirmed: false,
  direction: "deposit",
};

function memoryStorage() {
  const items: Record<string, unknown> = {};
  return {
    get: jest.fn(async (keys: null | string[]) => {
      return keys === null
        ? { ...items }
        : Object.fromEntries(
            keys.filter((key) => key in items).map((key) => [key, items[key]])
          );
    }),
    set: jest.fn(async (updates: Record<string, unknown>) => {
      Object.assign(items, updates);
    }),
  };
}

function storeFor(storage: ReturnType<typeof memoryStorage>) {
  return new PendingTransactionStore(createPendingJournalStorage(storage));
}

it("restores public pending transfers in a new store after the page closes", async () => {
  const storage = memoryStorage();
  await storeFor(storage).merge("wallet-one", [transaction]);
  const reopened = storeFor(storage);
  expect(await reopened.read("wallet-one")).toEqual([transaction]);
  expect(await reopened.read("wallet-two")).toEqual([]);
});

it("reads only owner-scoped values when the browser supports key enumeration", async () => {
  const storage = memoryStorage();
  await storeFor(storage).merge("wallet-one", [transaction]);
  await storeFor(storage).merge("wallet-two", [
    { ...transaction, hash: "B".repeat(64) },
  ]);
  const keys = Object.keys(await storage.get(null));
  const getKeys = jest.fn(async () => [
    ...keys,
    "unrelated-vault",
    "price-cache",
  ]);
  storage.get.mockClear();
  const journal = createPendingJournalStorage({ ...storage, getKeys });
  expect(await new PendingTransactionStore(journal).read("wallet-one")).toEqual(
    [transaction]
  );
  expect(getKeys).toHaveBeenCalledTimes(1);
  expect(storage.get).toHaveBeenCalledWith(
    keys.filter((key) => key.includes("wallet-one/"))
  );
});

it("preserves a broadcast when an earlier storage read resolves late", async () => {
  const storage = memoryStorage();
  let release!: (items: Record<string, unknown>) => void;
  storage.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const store = storeFor(storage);
  const read = store.read("wallet");
  await store.merge("wallet", [transaction]);
  release({});
  expect(await read).toEqual([transaction]);
});

it("never downgrades confirmed delivery when another popup writes an old poll", async () => {
  const storage = memoryStorage();
  const first = storeFor(storage);
  const second = storeFor(storage);
  await first.merge("wallet", [transaction]);
  await second.read("wallet");
  await first.merge("wallet", [
    {
      ...transaction,
      confirmed: true,
      received: true,
      packetSequence: "42",
      submissionUnknown: false,
    },
  ]);
  await second.merge("wallet", [{ ...transaction, submissionUnknown: true }]);
  expect(await storeFor(storage).read("wallet")).toEqual([
    expect.objectContaining({
      confirmed: true,
      received: true,
      packetSequence: "42",
      submissionUnknown: false,
    }),
  ]);
});

it("cancels only an attempt that is known not to have been dispatched", async () => {
  const storage = memoryStorage();
  const store = storeFor(storage);
  await store.merge(
    "wallet",
    [
      {
        ...transaction,
        submissionUnknown: true,
        submissionAttempts: { first: "unknown" },
      },
    ],
    true
  );
  await store.merge("wallet", [
    {
      ...transaction,
      cancelled: true,
      submissionAttempts: { first: "cancelled" },
    },
  ]);
  expect(await storeFor(storage).read("wallet")).toEqual([
    expect.objectContaining({ cancelled: true }),
  ]);
});

it("does not let one popup's cancellation hide another same-hash submission", async () => {
  const storage = memoryStorage();
  const first = storeFor(storage);
  const second = storeFor(storage);
  await first.merge(
    "wallet",
    [
      {
        ...transaction,
        submissionUnknown: true,
        submissionAttempts: { first: "unknown" },
      },
    ],
    true
  );
  await second.merge(
    "wallet",
    [
      {
        ...transaction,
        submissionUnknown: true,
        submissionAttempts: { second: "unknown" },
      },
    ],
    true
  );
  await first.merge("wallet", [
    {
      ...transaction,
      cancelled: true,
      submissionAttempts: { first: "cancelled" },
    },
  ]);
  expect(await storeFor(storage).read("wallet")).toEqual([
    expect.objectContaining({
      cancelled: false,
      submissionUnknown: true,
      submissionAttempts: { first: "cancelled", second: "unknown" },
    }),
  ]);
  await second.merge("wallet", [
    {
      ...transaction,
      confirmed: true,
      received: true,
      submissionUnknown: false,
    },
  ]);
  await first.merge("wallet", [
    {
      ...transaction,
      cancelled: true,
      submissionAttempts: { first: "cancelled" },
    },
  ]);
  expect(await storeFor(storage).read("wallet")).toEqual([
    expect.objectContaining({
      cancelled: false,
      confirmed: true,
      received: true,
      submissionUnknown: false,
    }),
  ]);
});

it("keeps legacy cancellation without attempt proof uncertain", async () => {
  const storage = memoryStorage();
  await storage.set({
    "epix-swap-pending/wallet": [{ ...transaction, cancelled: true }],
  });
  expect(await storeFor(storage).read("wallet")).toEqual([
    expect.objectContaining({ cancelled: false }),
  ]);
});

it("keeps hashes from two popups whose writes race from the same empty snapshot", async () => {
  const storage = memoryStorage();
  const originalSet = storage.set.getMockImplementation();
  if (!originalSet) throw new Error("Missing storage fixture");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  storage.set.mockImplementationOnce(async (updates) => {
    await gate;
    await originalSet(updates);
  });
  const first = storeFor(storage).merge("wallet", [transaction], true);
  const other = { ...transaction, hash: "B".repeat(64) };
  await storeFor(storage).merge("wallet", [other], true);
  release();
  await first;
  expect(await storeFor(storage).read("wallet")).toEqual(
    expect.arrayContaining([transaction, other])
  );
});

it("retains legacy unresolved records without overwriting an owner array", async () => {
  const storage = memoryStorage();
  await storage.set({ "epix-swap-pending/wallet": [transaction] });
  const store = storeFor(storage);
  await store.merge("wallet", [{ ...transaction, hash: "B".repeat(64) }]);
  expect(await store.read("wallet")).toHaveLength(2);
  expect((await storage.get(null))["epix-swap-pending/wallet"]).toEqual([
    transaction,
  ]);
});

it("keeps in-memory tracking when post-dispatch storage fails", async () => {
  const storage = memoryStorage();
  storage.set.mockRejectedValueOnce(new Error("unavailable"));
  const store = storeFor(storage);
  await expect(store.merge("wallet", [transaction])).resolves.toEqual([
    transaction,
  ]);
  expect(await store.read("wallet")).toEqual([transaction]);
});

it("rejects and rolls back a failed required save, then permits a later retry", async () => {
  const storage = memoryStorage();
  storage.set.mockRejectedValueOnce(new Error("unavailable"));
  const store = storeFor(storage);
  await expect(store.merge("wallet", [transaction], true)).rejects.toThrow(
    "unavailable"
  );
  expect(await store.read("wallet")).toEqual([]);
  await store.merge("wallet", [transaction], true);
  expect(await storeFor(storage).read("wallet")).toEqual([transaction]);
});

it("fails closed if pre-dispatch recovery cannot be read", async () => {
  const storage = memoryStorage();
  storage.get.mockRejectedValueOnce(new Error("unavailable"));
  await expect(
    storeFor(storage).merge("wallet", [transaction], true)
  ).rejects.toThrow("unavailable");
  expect(storage.set).not.toHaveBeenCalled();
});

it("retains every unresolved transaction when completed history exceeds the display limit", async () => {
  const storage = memoryStorage();
  const transactions = Array.from({ length: 25 }, (_, index) => ({
    ...transaction,
    hash: index.toString(16).padStart(64, "0").toUpperCase(),
  }));
  const store = storeFor(storage);
  await store.merge("wallet", [
    ...transactions,
    ...transactions.map((item) => ({
      ...item,
      chainId: "osmosis-1",
      direction: undefined,
      confirmed: true,
    })),
  ]);
  const restored = await storeFor(storage).read("wallet");
  expect(restored.filter((item) => !item.confirmed)).toHaveLength(25);
  expect(restored.filter((item) => item.confirmed)).toHaveLength(20);
});

it("snapshots caller objects and rejects invalid transaction data", async () => {
  const storage = memoryStorage();
  const store = storeFor(storage);
  const input = { ...transaction };
  const save = store.merge("wallet", [input], true);
  input.hash = "B".repeat(64);
  await save;
  expect(await storeFor(storage).read("wallet")).toEqual([transaction]);
  await expect(
    store.merge("wallet", [{ ...transaction, hash: "bad" }], true)
  ).rejects.toThrow("Invalid pending transaction");
});
