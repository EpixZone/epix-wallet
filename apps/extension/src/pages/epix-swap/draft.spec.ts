import { MemoryKVStore } from "@keplr-wallet/common";
import { SwapDraft, SwapDraftStore, validateSwapDraft } from "./draft";

const draft: SwapDraft = {
  stage: "deposit",
  inputIndex: 0,
  outputIndex: 1,
  amount: "1.000000000000000001",
  slippage: 100,
  feeIndex: 3,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("restores only form choices for the same owner in a reopened store", async () => {
  const storage = new MemoryKVStore("swap-draft-restore");
  await new SwapDraftStore(storage).save("vault-and-addresses", draft);
  const reopened = new SwapDraftStore(storage);
  expect(await reopened.read("vault-and-addresses")).toEqual(draft);
  expect(await reopened.read("another-vault")).toBeUndefined();
});

it("accepts incomplete unsigned decimal editing states but rejects untrusted fields and options", () => {
  for (const amount of ["", ".", "1.", ".5", "0", "1.000000000000000001"]) {
    expect(validateSwapDraft({ ...draft, amount })).toBe(true);
  }
  for (const value of [
    null,
    [],
    { ...draft, signedTx: "must never persist" },
    { ...draft, stage: "unknown" },
    { ...draft, inputIndex: 4 },
    { ...draft, outputIndex: 0.5 },
    { ...draft, slippage: 10_000 },
    { ...draft, feeIndex: 0 },
    ...["1e3", "-1", "+1", "1.2.3", " 1", "1\n", "1".repeat(101)].map(
      (amount) => ({ ...draft, amount })
    ),
  ]) {
    expect(validateSwapDraft(value)).toBe(false);
  }
});

it("ignores invalid stored data and rejects invalid saves", async () => {
  const storage = new MemoryKVStore("swap-draft-invalid");
  await storage.set("wallet", { ...draft, feeIndex: 0 });
  const store = new SwapDraftStore(storage);
  expect(await store.read("wallet")).toBeUndefined();
  await expect(
    store.save("wallet", { ...draft, amount: "-1" })
  ).rejects.toThrow("Invalid swap draft");
  expect(await store.read("wallet")).toBeUndefined();
});

it("preserves a newer edit when the original stored read resolves late", async () => {
  const oldRead = deferred<unknown>();
  const storage = new MemoryKVStore("swap-draft-read-race");
  storage.get = <T>() => oldRead.promise as Promise<T | undefined>;
  const store = new SwapDraftStore(storage);
  const loading = store.read("wallet");
  const newer = { ...draft, amount: "2" };
  await store.save("wallet", newer);
  oldRead.resolve(draft);
  expect(await loading).toEqual(newer);
  expect(await store.read("wallet")).toEqual(newer);
});

it("serializes writes and snapshots arguments so old writes cannot replace new edits", async () => {
  const storage = new MemoryKVStore("swap-draft-write-race");
  const firstWrite = deferred<void>();
  const originalSet = storage.set.bind(storage);
  let writes = 0;
  storage.set = async <T>(key: string, value: T | null) => {
    if (++writes === 1) await firstWrite.promise;
    await originalSet(key, value);
  };
  const store = new SwapDraftStore(storage);
  const first = { ...draft, amount: "1" };
  const second = { ...draft, amount: "2" };
  const savedFirst = store.save("wallet", first);
  const savedSecond = store.save("wallet", second);
  second.amount = "3";
  firstWrite.resolve();
  await Promise.all([savedFirst, savedSecond]);
  expect(await new SwapDraftStore(storage).read("wallet")).toEqual({
    ...draft,
    amount: "2",
  });
  const result = await store.read("wallet");
  if (result) result.amount = "4";
  expect((await store.read("wallet"))?.amount).toBe("2");
});

it("surfaces storage failures and allows a later write to recover", async () => {
  const storage = new MemoryKVStore("swap-draft-recovery");
  const originalSet = storage.set.bind(storage);
  storage.set = jest
    .fn()
    .mockRejectedValueOnce(new Error("storage unavailable"))
    .mockImplementation(originalSet);
  const store = new SwapDraftStore(storage);
  await expect(store.save("wallet", draft)).rejects.toThrow(
    "storage unavailable"
  );
  await store.save("wallet", { ...draft, amount: "2" });
  expect((await new SwapDraftStore(storage).read("wallet"))?.amount).toBe("2");
});

it("retries a failed initial read instead of caching failure as an empty draft", async () => {
  const storage = new MemoryKVStore("swap-draft-read-retry");
  await storage.set("wallet", draft);
  const originalGet = storage.get.bind(storage);
  storage.get = jest
    .fn()
    .mockRejectedValueOnce(new Error("read unavailable"))
    .mockImplementation(originalGet);
  const store = new SwapDraftStore(storage);
  await expect(store.read("wallet")).rejects.toThrow("read unavailable");
  expect(await store.read("wallet")).toEqual(draft);
});
