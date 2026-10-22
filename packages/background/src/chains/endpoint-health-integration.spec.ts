import { KVStore } from "@keplr-wallet/common";
import { ChainInfo } from "@keplr-wallet/types";
import { Env, MessageSender } from "@keplr-wallet/router";
import { runInAction } from "mobx";
import { ChainsService } from "./service";
import { ENDPOINT_INVENTORY } from "./endpoint-health-inventory";
import { getHandler } from "./handler";
import {
  CheckEndpointHealthMsg,
  EndpointHealthChangedMsg,
  GetChainInfosWithCoreTypesMsg,
  SetEndpointPublicFallbackMsg,
  SuggestChainInfoMsg,
} from "./messages";

class Store implements KVStore {
  data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T | null): Promise<void> {
    this.data.set(key, JSON.parse(JSON.stringify(value)));
  }
  prefix() {
    return "test";
  }
}

const inventory = ENDPOINT_INVENTORY[0];
const preferred = inventory.profiles[0].endpoints;
const backup = inventory.profiles[1].endpoints;
const coin = { coinDenom: "EPIX", coinMinimalDenom: "aepix", coinDecimals: 18 };
const chain: ChainInfo = {
  chainId: inventory.chainId,
  chainName: "Epix",
  rpc: preferred.rpc,
  rest: preferred.rest,
  evm: { chainId: 1916, rpc: preferred.evmRpc! },
  bip44: { coinType: 60 },
  currencies: [coin],
  feeCurrencies: [coin],
};

function fixture(initial: ChainInfo = chain) {
  const now = 1_792_660_000_000;
  const fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("epix.zone"))
        return new Response("Unavailable", { status: 503 });
      const time = new Date(now - 1000).toISOString();
      let body: unknown;
      if (init?.body) {
        const request = JSON.parse(init.body as string);
        const responses: Record<string, unknown> = {
          eth_chainId: "0x77c",
          eth_syncing: false,
          eth_getBlockByNumber: {
            number: "0x64",
            timestamp: `0x${Math.floor(now / 1000).toString(16)}`,
          },
        };
        body = {
          jsonrpc: "2.0",
          id: request.id,
          result: responses[request.method],
        };
      } else if (url.endsWith("/status")) {
        body = {
          result: {
            node_info: { network: chain.chainId },
            sync_info: {
              catching_up: false,
              latest_block_height: "100",
              latest_block_time: time,
            },
          },
        };
      } else if (url.endsWith("/node_info")) {
        body = { default_node_info: { network: chain.chainId } };
      } else {
        body = {
          block: { header: { chain_id: chain.chainId, height: "100", time } },
        };
      }
      return new Response(JSON.stringify(body));
    }
  );
  const store = new Store();
  const service = new ChainsService(
    store,
    { kvStore: new Store(), updaterKVStore: new Store() },
    [initial],
    [],
    { organizationName: "test", repoName: "test", branchName: "test" },
    { logEventIgnoreError: jest.fn() } as any,
    {} as any,
    undefined,
    { fetch, now: () => now, workerEpoch: "integration" }
  );
  const permissions = { addPermission: jest.fn() };
  const interactive = { ensureKeyRingNotEmpty: jest.fn() };
  const handler = getHandler(service, permissions as any, interactive as any);
  return { service, fetch, handler, permissions, interactive };
}

it("publishes one effective tuple in both legacy and modular snapshots without changing preferred settings", async () => {
  const f = fixture();
  await f.service.init();
  expect(f.fetch).not.toHaveBeenCalled();
  const changes: string[] = [];
  f.service.setEndpointHealthChangedHandler(() => {
    changes.push(f.service.getChainInfoOrThrow(chain.chainId).rpc);
  });
  await f.service.checkEndpointHealth(chain.chainId, "manual");
  const result = (await f.handler(
    {} as Env,
    new GetChainInfosWithCoreTypesMsg()
  )) as any;
  expect(result.chainInfos[0]).toMatchObject({
    rpc: backup.rpc,
    rest: backup.rest,
    evm: { rpc: backup.evmRpc, chainId: 1916 },
  });
  expect(result.modularChainInfos[0]).toMatchObject({
    type: "ethermint",
    cosmos: { rpc: backup.rpc, rest: backup.rest },
    evm: { rpc: backup.evmRpc, chainId: 1916 },
  });
  expect(result.endpointHealth[0]).toMatchObject({
    preferred,
    effective: backup,
    status: "backup",
    manual: false,
  });
  expect(f.service.getOriginalEndpoint(chain.chainId)).toEqual(preferred);
  expect(changes).toContain(backup.rpc);
  f.service.disposeEndpointHealth();
});

it("a manual edit immediately invalidates fallback even inside a surrounding MobX action", async () => {
  const f = fixture();
  await f.service.init();
  await f.service.checkEndpointHealth(chain.chainId, "manual");
  runInAction(() => {
    f.service.setEndpoint(chain.chainId, { rpc: "http://127.0.0.1:26657" });
    expect(f.service.getChainInfoOrThrow(chain.chainId).rpc).toBe(
      "http://127.0.0.1:26657"
    );
    expect(f.service.getEVMInfoOrThrow(chain.chainId).rpc).toBe(
      preferred.evmRpc
    );
  });
  expect(f.service.getEndpointHealthSnapshots()[0]).toMatchObject({
    manual: true,
    publicFallback: false,
    effective: { rpc: "http://127.0.0.1:26657", rest: preferred.rest },
  });
  f.fetch.mockClear();
  await f.service.checkEndpointHealth(chain.chainId, "manual");
  expect(
    f.fetch.mock.calls.every(
      ([url]) =>
        !String(url).includes("onenov") && !String(url).includes("vinjan")
    )
  ).toBe(true);
  f.service.clearEndpoint(chain.chainId);
  expect(f.service.getEndpointHealthSnapshots()[0]).toMatchObject({
    manual: false,
    publicFallback: true,
    preferred,
  });
  f.service.disposeEndpointHealth();
});

it.each([
  { ...chain, chainId: "epix_1916-2" },
  { ...chain, evm: { chainId: 1, rpc: preferred.evmRpc! } },
])(
  "does not recover a different full network or EVM mapping",
  async (metadata) => {
    const f = fixture(metadata);
    await f.service.init();
    await f.service.checkDueEndpointHealth();
    expect(f.service.getEndpointHealthSnapshots()).toEqual([]);
    expect(f.fetch).not.toHaveBeenCalled();
    f.service.disposeEndpointHealth();
  }
);

it("known Add-to-Wallet recovers stored services without accepting dapp endpoints or another permission", async () => {
  const f = fixture();
  await f.service.init();
  await f.handler(
    {} as Env,
    new SuggestChainInfoMsg({
      ...chain,
      rpc: "https://untrusted.test",
      rest: "https://untrusted.test",
      evm: { chainId: 1916, rpc: "https://untrusted.test" },
    })
  );
  expect(f.service.getChainInfoOrThrow(chain.chainId).rpc).toBe(backup.rpc);
  expect(
    f.fetch.mock.calls.some(([url]) => String(url).includes("untrusted"))
  ).toBe(false);
  expect(f.permissions.addPermission).not.toHaveBeenCalled();
  expect(f.interactive.ensureKeyRingNotEmpty).not.toHaveBeenCalled();
  f.service.disposeEndpointHealth();
});

it("all health controls and invalidations reject external messages and validate commands", () => {
  for (const message of [
    new CheckEndpointHealthMsg(),
    new SetEndpointPublicFallbackMsg(chain.chainId, true),
    new EndpointHealthChangedMsg(),
  ]) {
    expect(message.approveExternal({} as Env, {} as MessageSender)).toBe(false);
    expect(() => message.validateBasic()).not.toThrow();
  }
  expect(() =>
    new CheckEndpointHealthMsg(undefined, true).validateBasic()
  ).toThrow();
  expect(() =>
    new SetEndpointPublicFallbackMsg(
      chain.chainId,
      "true" as any
    ).validateBasic()
  ).toThrow();
});

it("rejects an old effective EVM tuple immediately when repository identity changes", async () => {
  const f = fixture();
  await f.service.init();
  await f.service.checkEndpointHealth(chain.chainId, "manual");
  runInAction(() => {
    (f.service as any).repoChainInfos = [
      { ...chain, evm: { chainId: 1, rpc: preferred.evmRpc } },
    ];
    expect(f.service.getEVMInfoOrThrow(chain.chainId)).toMatchObject({
      chainId: 1,
      rpc: preferred.evmRpc,
    });
    expect(f.service.getChainInfoOrThrow(chain.chainId).rpc).toBe(
      preferred.rpc
    );
  });
  expect(f.service.getEndpointHealthSnapshots()).toEqual([]);
  f.service.disposeEndpointHealth();
});

it("only follows a fresh verified REST alternative for a saved operation", async () => {
  const f = fixture();
  const clock = jest.spyOn(Date, "now").mockReturnValue(1_792_660_000_000);
  try {
    await f.service.init();
    expect(
      f.service.getVerifiedObservationRest(chain.chainId, "https://saved.test")
    ).toBe("https://saved.test");
    await f.service.checkEndpointHealth(chain.chainId, "manual");
    expect(
      f.service.getVerifiedObservationRest(chain.chainId, "https://saved.test")
    ).toBe(backup.rest);
    clock.mockReturnValue(1_792_660_030_001);
    expect(
      f.service.getVerifiedObservationRest(chain.chainId, "https://saved.test")
    ).toBe("https://saved.test");
    clock.mockReturnValue(1_792_659_999_999);
    expect(
      f.service.getVerifiedObservationRest(chain.chainId, "https://saved.test")
    ).toBe("https://saved.test");
    expect(
      f.service.getVerifiedObservationRest("epix_1916-2", "https://saved.test")
    ).toBe("https://saved.test");
  } finally {
    clock.mockRestore();
    f.service.disposeEndpointHealth();
  }
});
