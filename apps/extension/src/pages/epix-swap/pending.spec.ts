import { MemoryKVStore } from "@keplr-wallet/common";
import { PendingTransactionStore } from "./pending";
import { PendingSwapTransaction } from "./execution";

const transaction: PendingSwapTransaction = {
  chainId: "epix_1916-1",
  hash: "A".repeat(64),
  confirmed: false,
  direction: "deposit",
};

it("restores public pending transfers in a new store after the page closes", async () => {
  const storage = new MemoryKVStore("pending-test");
  await new PendingTransactionStore(storage).merge("wallet-one", [transaction]);
  const reopened = new PendingTransactionStore(storage);
  expect(await reopened.read("wallet-one")).toEqual([transaction]);
  expect(await reopened.read("wallet-two")).toEqual([]);
});

it("serializes a new broadcast behind delayed existing-state hydration", async () => {
  const storage = new MemoryKVStore("pending-race");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const originalGet = storage.get.bind(storage);
  storage.get = async <T>(key: string) => {
    await gate;
    return originalGet<T>(key);
  };
  const store = new PendingTransactionStore(storage);
  const read = store.read("wallet");
  const write = store.merge("wallet", [transaction]);
  release();
  await Promise.all([read, write]);
  expect(await store.read("wallet")).toEqual([transaction]);
});

it("never downgrades confirmed delivery when an older pending poll finishes", async () => {
  const store = new PendingTransactionStore(
    new MemoryKVStore("pending-status")
  );
  await store.merge("wallet", [transaction]);
  await store.merge("wallet", [
    { ...transaction, confirmed: true, received: true, packetSequence: "42" },
  ]);
  await store.merge("wallet", [transaction]);
  expect(await store.read("wallet")).toEqual([
    expect.objectContaining({
      confirmed: true,
      received: true,
      packetSequence: "42",
    }),
  ]);
});

it("keeps in-memory tracking when storage fails without rejecting broadcast bookkeeping", async () => {
  const storage = new MemoryKVStore("pending-failure");
  storage.set = async () => {
    throw new Error("unavailable");
  };
  const store = new PendingTransactionStore(storage);
  await expect(store.merge("wallet", [transaction])).resolves.toEqual([
    transaction,
  ]);
  expect(await store.read("wallet")).toEqual([transaction]);
});
