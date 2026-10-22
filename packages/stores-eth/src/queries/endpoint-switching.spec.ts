/** Regression coverage for endpoint changes using loopback HTTP only. */
import { createServer, Server, ServerResponse } from "node:http";
import { autorun } from "mobx";
import { MemoryKVStore } from "@keplr-wallet/common";
import type { ChainInfo } from "@keplr-wallet/types";
import {
  ChainStore,
  QuerySharedContext,
  ObservableChainQuery,
} from "@keplr-wallet/stores";
import { ObservableChainQueryRPC } from "@keplr-wallet/stores/build/query/chain-rpc-query";
// Static imports use package declarations so ordinary library compilation stays
// inside rootDir. Jest executes the current production sources below, including
// the RPC class which is exported through its package build subpath.
// Keep the EVM class and its base/provider helper real without unrelated accounts.
jest.mock("@keplr-wallet/stores/build/query/chain-rpc-query", () =>
  jest.requireActual("../../../stores/src/query/chain-rpc-query")
);
jest.mock("@keplr-wallet/stores", () => ({
  ...jest.requireActual("../../../stores/src/chain/base"),
  ...jest.requireActual("../../../stores/src/query/chain-query"),
  ...jest.requireActual("../../../stores/src/common/query/json-rpc"),
  ...jest.requireActual("../../../stores/src/common/query/context"),
  ...jest.requireActual("../../../stores/src/common/map"),
  ...jest.requireActual("../../../stores/src/account/get-keplr"),
}));
import { ObservableEvmChainJsonRpcQuery } from "./evm-chain-json-rpc";

type Capability = "rest" | "rpc" | "evm";
type Generation = "old" | "new";
type Payload =
  | { generation: Generation; capability: Capability; chainId: string }
  | string;
function generationOf(data: Payload | undefined) {
  return typeof data === "string"
    ? data === "0x101"
      ? "old"
      : data === "0x202"
      ? "new"
      : undefined
    : data?.generation;
}
type RequestEvidence = {
  path: string;
  method: string;
  released: boolean;
  closedBeforeRelease: boolean;
};
let contextId = 0;
const paths: RequestEvidence[] = [];
let server: Server;
let origin: string;
let held:
  | { response: ServerResponse; body: string; request: RequestEvidence }
  | undefined;
let holdNext = false;
let requestArrived: (() => void) | undefined;
const epix = "epix_1916-1";
const osmosis = "osmosis-1";

class SerializableKVStore extends MemoryKVStore {
  // Model the extension storage JSON boundary and remove Node/Jest cross-realm objects.
  override set<T = unknown>(key: string, value: T): Promise<void> {
    return super.set(key, JSON.parse(JSON.stringify(value)));
  }
}
class SettingsChainStore extends ChainStore {
  remove() {
    this.setEmbeddedChainInfos([]);
  }
  // Same production mutation used when the extension receives endpoint settings.
  replace(info: ChainInfo) {
    this.setEmbeddedChainInfos([info]);
  }
}
class RestQuery extends ObservableChainQuery<Payload> {
  cacheKey() {
    return this.getCacheKey();
  }
}
class RpcQuery extends ObservableChainQueryRPC<Payload> {
  cacheKey() {
    return this.getCacheKey();
  }
}
class EvmQuery extends ObservableEvmChainJsonRpcQuery<Payload> {
  cacheKey() {
    return this.getCacheKey();
  }
}

function chainInfo(chainId: string, generation: Generation): ChainInfo {
  const currency = {
    coinDenom: chainId === epix ? "EPIX" : "OSMO",
    coinMinimalDenom: chainId === epix ? "aepix" : "uosmo",
    coinDecimals: chainId === epix ? 18 : 6,
  };
  const prefix = chainId === epix ? "epix" : "osmo";
  return {
    chainId,
    chainName: chainId === epix ? "Epix" : "Osmosis",
    rpc: `${origin}/${generation}/rpc/${chainId}`,
    rest: `${origin}/${generation}/rest/${chainId}`,
    bip44: { coinType: 118 },
    currencies: [currency],
    feeCurrencies: [currency],
    stakeCurrency: currency,
    bech32Config: {
      bech32PrefixAccAddr: prefix,
      bech32PrefixAccPub: `${prefix}pub`,
      bech32PrefixValAddr: `${prefix}valoper`,
      bech32PrefixValPub: `${prefix}valoperpub`,
      bech32PrefixConsAddr: `${prefix}valcons`,
      bech32PrefixConsPub: `${prefix}valconspub`,
    },
    ...(chainId === epix
      ? {
          evm: { chainId: 1916, rpc: `${origin}/${generation}/evm/${chainId}` },
        }
      : {}),
  };
}
function context() {
  const kv = new SerializableKVStore(`issue-606-${contextId++}`);
  return { kv, ctx: new QuerySharedContext(kv, { responseDebounceMs: 0 }) };
}
function query(
  capability: Capability,
  chainId: string,
  store: SettingsChainStore,
  ctx: QuerySharedContext
) {
  if (capability === "rest")
    return new RestQuery(ctx, chainId, store, "/node_info");
  if (capability === "rpc") return new RpcQuery(ctx, chainId, store, "/status");
  // This is a read-only provider boundary fixture. It resolves the active URL at
  // request dispatch, matching background keyring-ethereum's forwarding behavior.
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      keplr: {
        ethereum: {
          async request(req: { method: string; chainId: string }) {
            if (req.method !== "eth_blockNumber" || req.chainId !== epix)
              throw new Error("Read-only fixture violation");
            const chain = store.getModularChain(req.chainId).unwrapped;
            if (chain.type !== "ethermint")
              throw new Error("Expected Ethermint");
            const url = chain.evm.rpc;
            if (!url.startsWith(`${origin}/`))
              throw new Error("Non-loopback endpoint blocked");
            const response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: req.method,
                params: [],
              }),
            });
            return JSON.parse(await response.text()).result;
          },
        },
      },
    },
  });
  return new EvmQuery(ctx, chainId, store, "eth_blockNumber", []);
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Fixture exceeded 3 seconds")),
          3000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function releaseHeld() {
  if (!held) return;
  held.request.released = true;
  held.response.end(held.body);
  held = undefined;
}

beforeAll(async () => {
  expect(ObservableChainQuery).toBe(
    jest.requireActual("../../../stores/src/query/chain-query")
      .ObservableChainQuery
  );
  expect(ObservableChainQueryRPC).toBe(
    jest.requireActual("../../../stores/src/query/chain-rpc-query")
      .ObservableChainQueryRPC
  );
  server = createServer(async (req, res) => {
    const [generation, capability, chainId] = (req.url || "")
      .split("/")
      .filter(Boolean);
    if (
      !["old", "new"].includes(generation) ||
      !["rest", "rpc", "evm"].includes(capability) ||
      ![epix, osmosis].includes(chainId)
    ) {
      res.writeHead(400).end();
      return;
    }
    let requestBody = "";
    for await (const chunk of req) requestBody += chunk.toString();
    if (
      capability === "evm" &&
      (req.method !== "POST" ||
        JSON.parse(requestBody).method !== "eth_blockNumber")
    ) {
      res.writeHead(405).end();
      return;
    }
    const payload = { generation, capability, chainId };
    const body = JSON.stringify(
      capability === "evm"
        ? {
            jsonrpc: "2.0",
            id: 1,
            result: generation === "old" ? "0x101" : "0x202",
          }
        : payload
    );
    const request = {
      path: req.url ?? "",
      method: req.method ?? "",
      released: false,
      closedBeforeRelease: false,
    };
    paths.push(request);
    res.on("close", () => {
      if (!request.released) request.closedBeforeRelease = true;
    });
    res.writeHead(200, { "content-type": "application/json" });
    if (holdNext && generation === "old") {
      holdNext = false;
      held = { response: res, body, request };
      requestArrived?.();
    } else {
      request.released = true;
      res.end(body);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(() => {
  releaseHeld();
  holdNext = false;
  requestArrived = undefined;
  delete (globalThis as any).window;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

it.each([
  [epix, "rest"],
  [epix, "rpc"],
  [osmosis, "rest"],
  [osmosis, "rpc"],
] as const)(
  "%s existing %s query follows changed endpoint without reconstruction",
  async (chainId, capability) => {
    const store = new SettingsChainStore([chainInfo(chainId, "old")]);
    const chainObject = store.getModularChain(chainId);
    const { ctx } = context();
    const q = query(capability, chainId, store, ctx);
    expect(generationOf((await bounded(q.waitFreshResponse()))?.data)).toBe(
      "old"
    );
    store.replace(chainInfo(chainId, "new"));
    expect(store.getModularChain(chainId)).toBe(chainObject);
    const current = store.getModularChain(chainId).unwrapped;
    if (current.type !== "cosmos" && current.type !== "ethermint")
      throw new Error("Expected Cosmos");
    expect(current.cosmos[capability]).toContain("/new/");
    const result = await bounded(q.waitFreshResponse());
    const replacement = query(capability, chainId, store, ctx);
    const control = await bounded(replacement.waitFreshResponse());
    expect(generationOf(control?.data)).toBe("new");
    expect(generationOf(result?.data)).toBe("new");
    expect(q.cacheKey()).toBe(replacement.cacheKey());
  }
);

it("Epix EVM uses new provider endpoint but must move its cache identity", async () => {
  const store = new SettingsChainStore([chainInfo(epix, "old")]);
  const { ctx, kv } = context();
  const q = query("evm", epix, store, ctx);
  const oldKey = q.cacheKey();
  expect(generationOf((await bounded(q.waitFreshResponse()))?.data)).toBe(
    "old"
  );
  store.replace(chainInfo(epix, "new"));
  const response = await bounded(q.waitFreshResponse());
  expect(generationOf(response?.data)).toBe("new");
  const replacement = query("evm", epix, store, ctx);
  const newKey = replacement.cacheKey();
  expect(q.cacheKey()).not.toBe(oldKey);
  expect(q.cacheKey()).toBe(newKey);
  expect((await kv.get<{ data: string }>(newKey))?.data).toBe("0x202");
});

it.each(["rest", "rpc", "evm"] as const)(
  "%s old in-flight response cannot be published after endpoint settings change",
  async (capability) => {
    const store = new SettingsChainStore([chainInfo(epix, "old")]);
    const { ctx, kv } = context();
    const q = query(capability, epix, store, ctx);
    const oldKey = q.cacheKey();
    const observed: unknown[] = [];
    let changed = false;
    holdNext = true;
    const arrived = new Promise<void>((resolve) => {
      requestArrived = resolve;
    });
    const dispose = autorun(() => {
      if (q.response) observed.push({ changed, response: q.response });
    });
    try {
      const pending = q.waitFreshResponse();
      await bounded(arrived);
      store.replace(chainInfo(epix, "new"));
      changed = true;
      const heldAtChange = held;
      expect(heldAtChange).toBeDefined();
      releaseHeld();
      await bounded(pending);
      const oldPublished = observed.some(
        (item: any) =>
          item.changed &&
          generationOf(item.response.data) === "old" &&
          !item.response.staled
      );
      expect(oldPublished).toBe(false);
      expect(await kv.get(oldKey)).toBeUndefined();
    } finally {
      dispose();
      releaseHeld();
    }
  }
);

it.each(["rest", "rpc", "evm"] as const)(
  "%s endpoint observation tolerates chain removal and resumes after re-addition",
  async (capability) => {
    const store = new SettingsChainStore([chainInfo(epix, "old")]);
    const { ctx } = context();
    const q = query(capability, epix, store, ctx);
    const dispose = autorun(() => {
      void q.response;
      void q.isFetching;
    });
    try {
      expect(generationOf((await bounded(q.waitFreshResponse()))?.data)).toBe(
        "old"
      );
      const requestsBeforeRemoval = paths.length;
      store.remove();
      expect(await bounded(q.waitFreshResponse())).toBeUndefined();
      expect(q.isFetching).toBe(false);
      expect(paths.length).toBe(requestsBeforeRemoval);
      store.replace(chainInfo(epix, "new"));
      expect(generationOf((await bounded(q.waitFreshResponse()))?.data)).toBe(
        "new"
      );
    } finally {
      dispose();
    }
  }
);
