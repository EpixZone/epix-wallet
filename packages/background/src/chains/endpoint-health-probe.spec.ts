import {
  checkCosmosProfileLag,
  endpointRequestURL,
  probeEndpoint,
} from "./endpoint-health-probe";
import {
  ENDPOINT_INVENTORY,
  getEndpointInventory,
} from "./endpoint-health-inventory";

const now = 1_792_660_000_000;
function rpc(chainId = "epix_1916-1", height = "100", time = now - 5000) {
  return {
    result: {
      node_info: { network: chainId },
      sync_info: {
        catching_up: false,
        latest_block_height: height,
        latest_block_time: new Date(time).toISOString(),
      },
    },
  };
}
function options(
  fetch: typeof globalThis.fetch,
  capability: "rpc" | "rest" | "evmRpc" = "rpc"
) {
  return {
    chainId: "epix_1916-1",
    evmChainId: "1916",
    capability,
    endpoint: "https://node.test/prefix",
    fetch,
    now: () => now,
    signal: new AbortController().signal,
  };
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => jest.useRealTimers());

it("keeps a small immutable exact-identity inventory with explicit service URLs", () => {
  expect(ENDPOINT_INVENTORY).toHaveLength(2);
  expect(getEndpointInventory("epix_1916-2")).toBeUndefined();
  expect(getEndpointInventory("epix")).toBeUndefined();
  expect(getEndpointInventory("eip155:1916")).toBeUndefined();
  expect(getEndpointInventory("epix_1916-1")?.evmChainId).toBe("1916");
  for (const chain of ENDPOINT_INVENTORY) {
    expect(chain.profiles).toHaveLength(3);
    for (const profile of chain.profiles) {
      expect(Object.isFrozen(profile.endpoints)).toBe(true);
      for (const value of Object.values(profile.endpoints)) {
        const url = new URL(value);
        expect(url.protocol).toBe("https:");
        expect(url.username + url.password + url.hash).toBe("");
      }
    }
  }
  expect(
    endpointRequestURL("https://rpc.lavenderfive.com:443/osmosis/", "/status")
  ).toBe("https://rpc.lavenderfive.com/osmosis/status");
});

it("checks full RPC identity, freshness and sync state with credential-free bounded fetches", async () => {
  const fetch = jest.fn(async () => json(rpc()));
  expect(await probeEndpoint(options(fetch))).toMatchObject({
    status: "healthy",
    height: "100",
    blockTime: now - 5000,
  });
  expect(fetch.mock.calls[0]).toEqual([
    "https://node.test/prefix/status",
    expect.objectContaining({
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: expect.any(AbortSignal),
    }),
  ]);
  for (const [payload, status] of [
    [rpc("epix_1916-2"), "wrong-chain"],
    [rpc("epix_1916-1", "100", now - 121000), "stale"],
    [rpc("epix_1916-1", "100", now + 31000), "stale"],
    [rpc("epix_1916-1", "0"), "malformed"],
    [
      {
        result: {
          ...rpc().result,
          sync_info: { ...rpc().result.sync_info, catching_up: true },
        },
      },
      "syncing",
    ],
    [
      {
        result: {
          ...rpc().result,
          sync_info: { ...rpc().result.sync_info, catching_up: "false" },
        },
      },
      "malformed",
    ],
  ] as const)
    expect(
      (await probeEndpoint(options(async () => json(payload)))).status
    ).toBe(status);
});

it.each(["block", "sdk_block"])(
  "accepts %s REST headers and ordinary blocks larger than 1 MiB",
  async (shape) => {
    const fetch = jest.fn(async (input: RequestInfo | URL) =>
      json(
        String(input).endsWith("node_info")
          ? { default_node_info: { network: "epix_1916-1" } }
          : {
              [shape]: {
                header: {
                  chain_id: "epix_1916-1",
                  height: "9007199254740995",
                  time: new Date(now).toISOString(),
                },
                data: { txs: ["x".repeat(2 * 1024 * 1024)] },
              },
            }
      )
    );
    expect(await probeEndpoint(options(fetch, "rest"))).toMatchObject({
      status: "healthy",
      height: "9007199254740995",
    });
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://node.test/prefix/cosmos/base/tendermint/v1beta1/node_info",
      "https://node.test/prefix/cosmos/base/tendermint/v1beta1/blocks/latest",
    ]);
  }
);

it("rejects wrong REST header identity even when node-info matches", async () => {
  const fetch = async (input: RequestInfo | URL) =>
    json(
      String(input).endsWith("node_info")
        ? { default_node_info: { network: "epix_1916-1" } }
        : {
            block: {
              header: {
                chain_id: "epix_1916-2",
                height: "100",
                time: new Date(now).toISOString(),
              },
            },
          }
    );
  expect((await probeEndpoint(options(fetch, "rest"))).status).toBe(
    "wrong-chain"
  );
});

it("bounds streamed status and REST block bodies even with a false Content-Length", async () => {
  let cancelled = false;
  const large = () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "Content-Length": "1" } }
    );
  expect((await probeEndpoint(options(async () => large()))).status).toBe(
    "malformed"
  );
  expect(cancelled).toBe(true);
  cancelled = false;
  const fetch = async (input: RequestInfo | URL) =>
    String(input).endsWith("node_info")
      ? json({ default_node_info: { network: "epix_1916-1" } })
      : large();
  expect((await probeEndpoint(options(fetch, "rest"))).status).toBe(
    "malformed"
  );
  expect(cancelled).toBe(true);
});

it("validates EVM JSON-RPC envelopes, exact reviewed identity, sync and latest block", async () => {
  let bad: string | undefined;
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(init?.body as string);
      const results: Record<string, unknown> = {
        eth_chainId: bad === "chain" ? "0x77d" : "0x77c",
        eth_syncing: bad === "sync" ? {} : false,
        eth_getBlockByNumber:
          bad === "null"
            ? null
            : {
                number: "0x20000000000001",
                timestamp: `0x${Math.floor(now / 1000).toString(16)}`,
              },
      };
      return json({
        jsonrpc: "2.0",
        id: bad === "id" ? request.id + 1 : request.id,
        result: results[request.method],
        ...(bad === "error" ? { error: { code: -1 } } : {}),
      });
    }
  );
  expect(await probeEndpoint(options(fetch, "evmRpc"))).toMatchObject({
    status: "healthy",
    height: "9007199254740993",
  });
  for (const [value, status] of [
    ["chain", "wrong-chain"],
    ["sync", "syncing"],
    ["null", "malformed"],
    ["id", "malformed"],
    ["error", "malformed"],
  ]) {
    bad = value;
    expect((await probeEndpoint(options(fetch, "evmRpc"))).status).toBe(status);
  }
});

it("settles a hung fetch at the capability deadline and on cancellation", async () => {
  jest.useFakeTimers();
  let signal: AbortSignal | undefined;
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise(() => undefined);
  };
  const first = probeEndpoint(options(fetch));
  jest.advanceTimersByTime(5000);
  expect(await first).toMatchObject({
    status: "unavailable",
    detail: "Health check timed out",
  });
  expect(signal?.aborted).toBe(true);
  const controller = new AbortController();
  const second = probeEndpoint({
    ...options(fetch),
    signal: controller.signal,
  });
  controller.abort();
  expect((await second).status).toBe("unavailable");
  expect(jest.getTimerCount()).toBe(0);
});

it("does not follow redirects or expose arbitrary fetch exception contents", async () => {
  const redirected = json(rpc());
  Object.defineProperty(redirected, "redirected", { value: true });
  expect((await probeEndpoint(options(async () => redirected))).status).toBe(
    "unavailable"
  );
  expect(
    await probeEndpoint(
      options(async () => {
        throw new Error("secret query credentials");
      })
    )
  ).toMatchObject({ detail: "Endpoint request failed" });
  expect(
    (
      await probeEndpoint(
        options(async () => new Response("bad", { status: 429 }))
      )
    ).status
  ).toBe("unavailable");
});

it("marks only a clearly lagging Cosmos member and tolerates normal call skew", () => {
  const health = (height: string, blockTime: number) => ({
    endpoint: "https://node.test",
    status: "healthy" as const,
    height,
    blockTime,
    checkedAt: now,
  });
  expect(
    checkCosmosProfileLag(health("100", now), health("70", now - 31000)).map(
      (value) => value.status
    )
  ).toEqual(["healthy", "stale"]);
  expect(
    checkCosmosProfileLag(health("70", now - 31000), health("100", now)).map(
      (value) => value.status
    )
  ).toEqual(["stale", "healthy"]);
  expect(
    checkCosmosProfileLag(health("100", now), health("95", now - 5000)).map(
      (value) => value.status
    )
  ).toEqual(["healthy", "healthy"]);
  expect(
    checkCosmosProfileLag(health("100", now), health("70", now - 5000)).map(
      (value) => value.status
    )
  ).toEqual(["healthy", "healthy"]);
});
