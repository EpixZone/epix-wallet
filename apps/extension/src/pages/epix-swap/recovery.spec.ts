import { transactionExplorerUrl } from "./explorer";
import {
  refreshPendingTransaction,
  isPendingTransaction,
  PendingSwapTransaction,
} from "./execution";
const transaction: PendingSwapTransaction = {
  chainId: "epix_1916-1",
  hash: "A".repeat(64),
  confirmed: false,
  direction: "deposit",
  submissionUnknown: true,
};
const endpoints = {
  epix: "https://epix.test",
  osmosis: "https://osmosis.test",
};
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

it("preserves an uncertain submission on a404 instead of permitting a duplicate send", async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 404, ok: false });
  const result = await refreshPendingTransaction(
    transaction,
    endpoints,
    new AbortController().signal
  );
  expect(result).toEqual(transaction);
  expect(isPendingTransaction(result)).toBe(true);
});

it("resumes source confirmation for the exact saved hash", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({
      tx_response: { txhash: transaction.hash, code: 0, events: [] },
    }),
  });
  const result = await refreshPendingTransaction(
    transaction,
    endpoints,
    new AbortController().signal
  );
  expect(result).toMatchObject({ confirmed: true, submissionUnknown: false });
  expect(isPendingTransaction(result)).toBe(true); // IBC delivery still needs its exact acknowledgement.
  expect(global.fetch).toHaveBeenCalledWith(
    `https://epix.test/cosmos/tx/v1beta1/txs/${transaction.hash}`,
    expect.anything()
  );
});

it("times out a stalled response body and can retry its status later", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_url, options) =>
    Promise.resolve({
      status: 200,
      ok: true,
      json: () =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        }),
    } as Response)
  );
  const result = refreshPendingTransaction(
    transaction,
    endpoints,
    new AbortController().signal
  );
  const rejection = expect(result).rejects.toThrow("aborted");
  await Promise.resolve();
  jest.advanceTimersByTime(10000);
  await rejection;
  global.fetch = jest.fn().mockResolvedValue({ status: 404, ok: false });
  await expect(
    refreshPendingTransaction(
      transaction,
      endpoints,
      new AbortController().signal
    )
  ).resolves.toEqual(transaction);
});

it("propagates page cancellation to a pending network lookup", async () => {
  const controller = new AbortController();
  global.fetch = jest.fn(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new Error("cancelled"))
        );
      })
  );
  const result = refreshPendingTransaction(
    transaction,
    endpoints,
    controller.signal
  );
  const rejection = expect(result).rejects.toThrow("cancelled");
  controller.abort();
  await rejection;
});

it("links only known chains and exact transaction hashes to verified explorers", () => {
  expect(transactionExplorerUrl("epix_1916-1", transaction.hash)).toBe(
    `https://explorer.epix.zone/?tx=${transaction.hash}`
  );
  expect(transactionExplorerUrl("osmosis-1", transaction.hash)).toBe(
    `https://www.mintscan.io/osmosis/transactions/${transaction.hash}`
  );
  expect(
    transactionExplorerUrl("osmosis-1", "javascript:alert(1)")
  ).toBeUndefined();
  expect(transactionExplorerUrl("other", transaction.hash)).toBeUndefined();
});
