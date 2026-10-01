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
    beforeBroadcast: jest.fn().mockResolvedValue(undefined),
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
    beforeBroadcast: jest.fn().mockResolvedValue(undefined),
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

it("awaits durable public hash persistence before dispatch without exposing signed bytes", async () => {
  let release!: () => void;
  const saved = new Promise<void>((resolve) => {
    release = resolve;
  });
  const beforeBroadcast = jest.fn(() => saved);
  const sendTx = jest.fn().mockResolvedValue(new Uint8Array([2]));
  const broadcast = guardedBroadcast({
    chainId: "osmosis-1",
    expiresAt: Date.now() + 60000,
    isCurrent: () => true,
    getProvider: async () => ({ sendTx }),
    beforeBroadcast,
  });
  const result = broadcast(
    "osmosis-1",
    new Uint8Array([1]),
    "sync" as BroadcastMode
  );
  await Promise.resolve();
  expect(beforeBroadcast).toHaveBeenCalledWith(
    "4BF5122F344554C53BDE2EBB8CD2B7E3D1600AD631C385A5D7CCE23C7785459A"
  );
  expect(sendTx).not.toHaveBeenCalled();
  release();
  await result;
  expect(sendTx).toHaveBeenCalledTimes(1);
});

it("never dispatches if the durable journal fails", async () => {
  const sendTx = jest.fn();
  const broadcast = guardedBroadcast({
    chainId: "osmosis-1",
    expiresAt: Date.now() + 60000,
    isCurrent: () => true,
    getProvider: async () => ({ sendTx }),
    beforeBroadcast: async () => {
      throw new Error("storage");
    },
  });
  await expect(
    broadcast("osmosis-1", new Uint8Array([1]), "sync" as BroadcastMode)
  ).rejects.toThrow("storage");
  expect(sendTx).not.toHaveBeenCalled();
});

it("cancels only before dispatch when the account changes during persistence", async () => {
  let current = true;
  const sendTx = jest.fn();
  const onNotBroadcast = jest.fn().mockResolvedValue(undefined);
  const broadcast = guardedBroadcast({
    chainId: "osmosis-1",
    expiresAt: Date.now() + 60000,
    isCurrent: () => current,
    getProvider: async () => ({ sendTx }),
    beforeBroadcast: async () => {
      current = false;
    },
    onNotBroadcast,
  });
  await expect(
    broadcast("osmosis-1", new Uint8Array([1]), "sync" as BroadcastMode)
  ).rejects.toThrow("changed");
  expect(onNotBroadcast).toHaveBeenCalledTimes(1);
  expect(sendTx).not.toHaveBeenCalled();
});

it("keeps ambiguous dispatch errors pending without declaring cancellation or retrying", async () => {
  const sendTx = jest.fn().mockRejectedValue(new Error("network"));
  const beforeBroadcast = jest.fn().mockResolvedValue(undefined);
  const onNotBroadcast = jest.fn();
  const broadcast = guardedBroadcast({
    chainId: "osmosis-1",
    expiresAt: Date.now() + 60000,
    isCurrent: () => true,
    getProvider: async () => ({ sendTx }),
    beforeBroadcast,
    onNotBroadcast,
  });
  await expect(
    broadcast("osmosis-1", new Uint8Array([1]), "sync" as BroadcastMode)
  ).rejects.toThrow("network");
  expect(beforeBroadcast).toHaveBeenCalledTimes(1);
  expect(sendTx).toHaveBeenCalledTimes(1);
  expect(onNotBroadcast).not.toHaveBeenCalled();
});
