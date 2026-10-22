import { autorun } from "mobx";
import { MemoryKVStore, DenomHelper } from "@keplr-wallet/common";
import type { ChainInfo } from "@keplr-wallet/types";
// Package imports keep normal builds within rootDir. The package Jest mapper
// resolves these to the current production sources, not a prior library build.
import {
  ChainStore,
  QuerySharedContext,
  ObservableQuery,
  ObservableQueryCosmosBalancesImplParent,
  CoinGeckoPriceStore,
} from "@keplr-wallet/stores";
import { ObservableQueryEthAccountBalanceImpl } from "./balance";

beforeAll(() => {
  expect(ObservableQuery).toBe(
    jest.requireActual("../../../stores/src/common/query/query").ObservableQuery
  );
  expect(ObservableQueryCosmosBalancesImplParent).toBe(
    jest.requireActual("../../../stores/src/query/cosmos/balance/balances")
      .ObservableQueryCosmosBalancesImplParent
  );
  expect(CoinGeckoPriceStore).toBe(
    jest.requireActual("../../../stores/src/price").CoinGeckoPriceStore
  );
});

class SerializableKV extends MemoryKVStore {
  override set<T = unknown>(key: string, value: T): Promise<void> {
    return super.set(key, JSON.parse(JSON.stringify(value)));
  }
}
class Settings extends ChainStore {
  remove() {
    this.setEmbeddedChainInfos([]);
  }
  replace(endpoint: string) {
    this.setEmbeddedChainInfos([chain(endpoint)]);
  }
}
const chainId = "epix_1916-1";
function chain(endpoint: string): ChainInfo {
  const currency = {
    coinDenom: "EPIX",
    coinMinimalDenom: "aepix",
    coinDecimals: 18,
  };
  return {
    chainId,
    chainName: "Epix",
    rpc: `https://${endpoint}.test/rpc`,
    rest: `https://${endpoint}.test/rest`,
    evm: { chainId: 1916, rpc: `https://${endpoint}.test/evm` },
    bip44: { coinType: 118 },
    currencies: [currency],
    feeCurrencies: [currency],
    stakeCurrency: currency,
    bech32Config: {
      bech32PrefixAccAddr: "epix",
      bech32PrefixAccPub: "epixpub",
      bech32PrefixValAddr: "epixvaloper",
      bech32PrefixValPub: "epixvaloperpub",
      bech32PrefixConsAddr: "epixvalcons",
      bech32PrefixConsPub: "epixvalconspub",
    },
  };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Balance fixture did not settle")),
          3000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

it.each(["cosmos", "evm"] as const)(
  "real %s balance cannot bypass endpoint removal and resumes on re-addition",
  async (kind) => {
    const settings = new Settings([chain("a")]);
    const ctx = new QuerySharedContext(new SerializableKV(`balance-${kind}`), {
      responseDebounceMs: 0,
    });
    const reads: string[] = [];
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        reads.push(url);
        return new Response(
          JSON.stringify({
            balances: [
              {
                denom: "aepix",
                amount: url.includes("b.test") ? "514" : "257",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      });
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window"
    );
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        keplr: {
          ethereum: {
            request: async (request: { method: string; chainId: string }) => {
              reads.push(request.method);
              expect(request).toMatchObject({
                method: "eth_getBalance",
                chainId,
              });
              const info = settings.getModularChain(chainId).unwrapped;
              if (info.type !== "ethermint")
                throw new Error("Expected Ethermint");
              return info.evm.rpc.includes("b.test") ? "0x202" : "0x101";
            },
          },
        },
      },
    });
    const q: ObservableQuery<unknown> =
      kind === "cosmos"
        ? new ObservableQueryCosmosBalancesImplParent(
            ctx,
            chainId,
            settings,
            "epix1fixture"
          )
        : new ObservableQueryEthAccountBalanceImpl(
            ctx,
            chainId,
            settings,
            new DenomHelper("aepix"),
            `0x${"12".repeat(20)}`
          );
    const dispose = autorun(() => {
      void q.response;
      void q.isFetching;
    });
    try {
      const first = await bounded(q.waitFreshResponse());
      expect(first?.data).toEqual(
        kind === "cosmos"
          ? { balances: [{ denom: "aepix", amount: "257" }] }
          : "0x101"
      );
      const beforeRemoval = reads.length;
      settings.remove();
      await expect(bounded(q.waitFreshResponse())).resolves.toBeUndefined();
      expect(reads).toHaveLength(beforeRemoval);
      expect(q.error).toBeUndefined();
      expect(q.isFetching).toBe(false);
      settings.replace("b");
      const next = await bounded(q.waitFreshResponse());
      expect(next?.data).toEqual(
        kind === "cosmos"
          ? { balances: [{ denom: "aepix", amount: "514" }] }
          : "0x202"
      );
      expect(reads.length).toBeGreaterThan(beforeRemoval);
    } finally {
      dispose();
      fetchMock.mockRestore();
      if (previousWindow)
        Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  }
);

it("generic relative-URL queries remain fetchable", async () => {
  class RelativeQuery extends ObservableQuery<string> {
    constructor() {
      super(
        new QuerySharedContext(new SerializableKV("relative"), {
          responseDebounceMs: 0,
        }),
        "",
        "/relative/read"
      );
    }
  }
  const fetchMock = jest.spyOn(globalThis, "fetch");
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify("relative-response"), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  try {
    const q = new RelativeQuery();
    expect((await bounded(q.waitFreshResponse()))?.data).toBe(
      "relative-response"
    );
    expect(fetchMock.mock.calls[0][0]).toBe("/relative/read");
    expect(q.isObserved).toBe(false);
  } finally {
    fetchMock.mockRestore();
  }
});

it("CoinGecko keeps direct disk prefetch and merges prices after its URL expands", async () => {
  class Prices extends CoinGeckoPriceStore {
    ready() {
      return this.waitUntilInitialized();
    }
  }
  const kv = new SerializableKV("price-compatibility");
  await kv.set("https://prices.test/simple/price", {
    data: { ethereum: { usd: 10 } },
    timestamp: Date.now(),
    staled: false,
    local: false,
  });
  const fetchMock = jest.spyOn(globalThis, "fetch");
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ osmosis: { usd: 2 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  try {
    const prices = new Prices(
      kv,
      {
        usd: { currency: "usd", symbol: "$", maxDecimals: 2, locale: "en-US" },
      },
      "usd",
      { baseURL: "https://prices.test", throttleDuration: 0 }
    );
    await bounded(prices.ready());
    expect(prices.isObserved).toBe(false);
    expect(prices.response?.data).toEqual({ ethereum: { usd: 10 } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prices.getPrice("ethereum")).toBe(10);
    expect(prices.getPrice("osmosis")).toBeUndefined();
    const response = await bounded(prices.waitFreshResponse());
    expect(response?.data).toEqual({
      ethereum: { usd: 10 },
      osmosis: { usd: 2 },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "ids=ethereum,osmosis"
    );
    expect(prices.isObserved).toBe(false);
  } finally {
    fetchMock.mockRestore();
  }
});
