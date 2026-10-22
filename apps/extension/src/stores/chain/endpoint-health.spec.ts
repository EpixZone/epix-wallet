jest.mock("@keplr-wallet/background", () =>
  require("../../../../../packages/background/src/chains/messages")
);

import { ChainInfo } from "@keplr-wallet/types";
import { MemoryKVStore } from "@keplr-wallet/common";
import { MessageRequester } from "@keplr-wallet/router";
import { KeyRingStore } from "@keplr-wallet/stores-core";
import { autorun, flowResult } from "mobx";
import { ChainStore } from "./index";
import { EndpointHealthSnapshot } from "@keplr-wallet/background";

class ViewStore extends ChainStore {
  // Avoid account/token startup; exercise the real metadata/health flow.
  protected override *init() {
    yield Promise.resolve();
  }
}
const coin = { coinDenom: "OSMO", coinMinimalDenom: "uosmo", coinDecimals: 6 };
const chain: ChainInfo = {
  chainId: "osmosis-1",
  chainName: "Osmosis",
  rpc: "https://preferred.test/rpc",
  rest: "https://preferred.test/rest",
  bip44: { coinType: 118 },
  currencies: [coin],
  feeCurrencies: [coin],
};
function snapshot(endpoint: string, epoch = "worker-1", revision = 1) {
  const endpoints = { rpc: `${endpoint}/rpc`, rest: `${endpoint}/rest` };
  const health: EndpointHealthSnapshot = {
    chainId: chain.chainId,
    preferred: { rpc: chain.rpc, rest: chain.rest },
    effective: endpoints,
    manual: false,
    publicFallback: true,
    capabilities: {
      rpc: { endpoint: endpoints.rpc, status: "healthy" },
      rest: { endpoint: endpoints.rest, status: "healthy" },
    },
    status: "backup",
    nextDueAt: 0,
    generation: revision,
    revision,
    workerEpoch: epoch,
  };
  return {
    chainInfos: [{ ...chain, ...endpoints }],
    modularChainInfos: [
      {
        isV2: true,
        chainId: chain.chainId,
        chainName: chain.chainName,
        type: "cosmos",
        cosmos: { ...chain, ...endpoints },
      },
    ],
    endpointHealth: [health],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function view(send: jest.Mock) {
  return new ViewStore(
    new MemoryKVStore("view"),
    [chain],
    {} as KeyRingStore,
    { sendMessage: send } as MessageRequester,
    false
  );
}

it("keeps metadata and health atomic in two views and discards late snapshots from an old worker", async () => {
  const held = deferred<ReturnType<typeof snapshot>>();
  const current = snapshot("https://recovered.test", "worker-new", 1);
  const first = view(
    jest.fn().mockReturnValueOnce(held.promise).mockResolvedValue(current)
  );
  const second = view(jest.fn().mockResolvedValue(current));
  const oldRequest = first.updateChainInfosFromBackground();
  const observations: string[][] = [];
  const dispose = autorun(() => {
    const metadata = first.getModularChain(chain.chainId).unwrapped;
    if (metadata.type !== "cosmos") throw new Error("Wrong fixture");
    observations.push([
      metadata.cosmos.rest,
      first.endpointHealth[0]?.effective.rest ?? "",
    ]);
  });
  await Promise.all([
    first.updateChainInfosFromBackground(),
    second.updateChainInfosFromBackground(),
  ]);
  held.resolve(snapshot("https://obsolete.test", "worker-old", 999));
  await oldRequest;
  for (const store of [first, second]) {
    const metadata = store.getModularChain(chain.chainId).unwrapped;
    expect(metadata).toMatchObject({
      cosmos: { rest: current.endpointHealth[0].effective.rest },
    });
    expect(store.endpointHealth).toEqual(current.endpointHealth);
  }
  expect(
    observations.slice(1).every(([rest, healthRest]) => rest === healthRest)
  ).toBe(true);
  dispose();
});

it("endpoint edits ignore mutation response metadata and refresh its matching health snapshot", async () => {
  const held = deferred<ReturnType<typeof snapshot>>();
  const after = snapshot("https://custom.test");
  const send = jest
    .fn()
    .mockReturnValueOnce(held.promise)
    .mockResolvedValueOnce(snapshot("https://stale-mutation.test"))
    .mockResolvedValueOnce(after);
  const store = view(send);
  const oldRequest = store.updateChainInfosFromBackground();
  await flowResult(
    store.setChainEndpoints(
      chain.chainId,
      "https://custom.test/rpc",
      "https://custom.test/rest",
      undefined
    )
  );
  held.resolve(snapshot("https://old.test"));
  await oldRequest;
  expect(store.endpointHealth).toEqual(after.endpointHealth);
  expect(store.getModularChain(chain.chainId).unwrapped).toMatchObject({
    cosmos: { rest: "https://custom.test/rest" },
  });
  expect(send.mock.calls.map(([, msg]) => msg.type())).toEqual([
    "get-chain-infos-with-core-types",
    "set-chain-endpoints",
    "get-chain-infos-with-core-types",
  ]);
});

it("a failed consent write still reloads the authoritative disabled preference", async () => {
  const current = snapshot("https://preferred.test");
  current.endpointHealth[0] = {
    ...current.endpointHealth[0],
    manual: true,
    publicFallback: false,
  };
  const send = jest
    .fn()
    .mockRejectedValueOnce(new Error("disk full"))
    .mockResolvedValueOnce(current);
  const store = view(send);
  await expect(
    store.setEndpointPublicFallback(chain.chainId, true)
  ).rejects.toThrow("disk full");
  expect(store.endpointHealth[0].publicFallback).toBe(false);
});
