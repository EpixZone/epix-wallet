import { BroadcastMode } from "@keplr-wallet/types";
import { guardedBroadcast } from "./execution";

it("checks the account and expiry after delayed signing/provider initialization", async () => {
  let resolveProvider!: (provider: { sendTx: jest.Mock }) => void;
  const provider = new Promise<{ sendTx: jest.Mock }>((resolve) => {
    resolveProvider = resolve;
  });
  let current = true;
  const sendTx = jest.fn();
  const broadcast = guardedBroadcast({
    chainId: "osmosis-1",
    expiresAt: Date.now() + 60_000,
    isCurrent: () => current,
    getProvider: () => provider,
  });
  const result = broadcast(
    "osmosis-1",
    new Uint8Array([1]),
    "sync" as BroadcastMode
  );
  current = false;
  resolveProvider({ sendTx });
  await expect(result).rejects.toThrow("changed");
  expect(sendTx).not.toHaveBeenCalled();
});

it("rejects an expired review and mismatched chain before broadcasting", async () => {
  const sendTx = jest.fn();
  const broadcast = guardedBroadcast({
    chainId: "osmosis-1",
    expiresAt: 0,
    isCurrent: () => true,
    getProvider: async () => ({ sendTx }),
  });
  await expect(
    broadcast("osmosis-1", new Uint8Array(), "sync" as BroadcastMode)
  ).rejects.toThrow("expired");
  await expect(
    broadcast("epix_1916-1", new Uint8Array(), "sync" as BroadcastMode)
  ).rejects.toThrow();
  expect(sendTx).not.toHaveBeenCalled();
});
