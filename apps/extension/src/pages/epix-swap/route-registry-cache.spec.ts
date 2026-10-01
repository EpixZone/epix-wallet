import { MemoryKVStore } from "@keplr-wallet/common";
import { MAX_OSMOSIS_REGISTRY_BYTES } from "./osmosis-asset-registry";
import {
  EMPTY_ROUTE_REGISTRY,
  ROUTE_REGISTRY_CACHE_KEY,
  ROUTE_REGISTRY_RETRY_MS,
  ROUTE_REGISTRY_TIMEOUT_MS,
  ROUTE_REGISTRY_TTL_MS,
  ROUTE_REGISTRY_URL,
  RouteRegistryCache,
} from "./route-registry-cache";

const now = ROUTE_REGISTRY_TTL_MS * 2;
const metadata = {
  denom: "factory/osmo1example/display-token",
  symbol: "TEST",
  name: "Display test token",
  iconUrl:
    "https://raw.githubusercontent.com/cosmos/chain-registry/main/osmosis/images/test.svg",
  isAlloyed: false,
};
const document = JSON.stringify({
  chainName: "osmosis",
  assets: [
    {
      coinMinimalDenom: metadata.denom,
      symbol: metadata.symbol,
      name: metadata.name,
      logoURIs: { svg: metadata.iconUrl },
      isAlloyed: false,
      decimals: 18,
      price: 123,
    },
  ],
});
const cached = (fetchedAt = now) => ({
  version: 1,
  fetchedAt,
  assets: [metadata],
});
const successfulFetch = () =>
  jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(() => Promise.resolve(new Response(document)));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

afterEach(() => jest.useRealTimers());

test("hydrates fresh validated metadata without a request and preserves its stable snapshot", async () => {
  const storage = new MemoryKVStore("registry-test");
  await storage.set(ROUTE_REGISTRY_CACHE_KEY, cached());
  const fetcher = successfulFetch();
  const cache = new RouteRegistryCache(storage, fetcher, () => now);
  expect(cache.snapshot()).toBe(EMPTY_ROUTE_REGISTRY);
  const listener = jest.fn();
  const unsubscribe = cache.subscribe(listener);
  await cache.hydrate();
  const snapshot = cache.snapshot();
  expect(snapshot.get(metadata.denom)).toEqual(metadata);
  expect(listener).toHaveBeenCalledTimes(1);
  await cache.refresh();
  await cache.hydrate();
  expect(cache.snapshot()).toBe(snapshot);
  expect(fetcher).not.toHaveBeenCalled();
  unsubscribe();
});

test("shows old validated cache immediately and keeps it when offline", async () => {
  const storage = new MemoryKVStore("registry-test");
  await storage.set(ROUTE_REGISTRY_CACHE_KEY, cached(0));
  const fetcher = successfulFetch().mockRejectedValue(new Error("Offline"));
  const cache = new RouteRegistryCache(storage, fetcher, () => now);
  await cache.hydrate();
  const snapshot = cache.snapshot();
  expect(snapshot.get(metadata.denom)).toEqual(metadata);
  await cache.refresh();
  expect(cache.snapshot()).toBe(snapshot);
  expect(await storage.get(ROUTE_REGISTRY_CACHE_KEY)).toEqual(cached(0));
});

test("refreshes at 24 hours and persists only compact validated display fields", async () => {
  const storage = new MemoryKVStore("registry-test");
  let time = now;
  await storage.set(ROUTE_REGISTRY_CACHE_KEY, cached());
  const fetcher = successfulFetch();
  const cache = new RouteRegistryCache(storage, fetcher, () => time);
  await cache.refresh();
  time += ROUTE_REGISTRY_TTL_MS - 1;
  await cache.refresh();
  expect(fetcher).not.toHaveBeenCalled();
  time += 1;
  await cache.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe(ROUTE_REGISTRY_URL);
  expect(options).toMatchObject({
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  });
  expect(await storage.get(ROUTE_REGISTRY_CACHE_KEY)).toEqual(cached(time));
  expect(JSON.stringify(cache.snapshot().get(metadata.denom))).not.toContain(
    "price"
  );
});

test("failed requests back off for five minutes without discarding a later successful result", async () => {
  const storage = new MemoryKVStore("registry-test");
  let time = now;
  const fetcher = successfulFetch().mockRejectedValueOnce(new Error("Offline"));
  const cache = new RouteRegistryCache(storage, fetcher, () => time);
  await cache.refresh();
  expect(cache.snapshot()).toBe(EMPTY_ROUTE_REGISTRY);
  time += ROUTE_REGISTRY_RETRY_MS - 1;
  await cache.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
  time += 1;
  await cache.refresh();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(cache.snapshot().get(metadata.denom)).toEqual(metadata);
});

test.each([
  ["wrong version", { ...cached(), version: 2 }],
  ["future timestamp", cached(now + 1)],
  ["negative timestamp", cached(-1)],
  ["infinite timestamp", cached(Number.POSITIVE_INFINITY)],
  ["NaN timestamp", cached(Number.NaN)],
  ["fractional timestamp", cached(now + 0.5)],
  ["missing assets", { version: 1, fetchedAt: now }],
  [
    "invalid metadata",
    { ...cached(), assets: [{ ...metadata, symbol: "Bad\nlabel" }] },
  ],
])(
  "does not trust cached %s or let it suppress a fresh request",
  async (_name, value) => {
    const storage = new MemoryKVStore("registry-test");
    await storage.set(ROUTE_REGISTRY_CACHE_KEY, value);
    const fetcher = successfulFetch();
    const cache = new RouteRegistryCache(storage, fetcher, () => now);
    await cache.hydrate();
    expect(cache.snapshot()).toBe(EMPTY_ROUTE_REGISTRY);
    await cache.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.snapshot().get(metadata.denom)).toEqual(metadata);
  }
);

test("revalidates cached icon URLs rather than trusting persisted metadata", async () => {
  const storage = new MemoryKVStore("registry-test");
  await storage.set(ROUTE_REGISTRY_CACHE_KEY, {
    ...cached(),
    assets: [{ ...metadata, iconUrl: "https://untrusted.example/token.svg" }],
  });
  const cache = new RouteRegistryCache(storage, successfulFetch(), () => now);
  await cache.hydrate();
  expect(cache.snapshot().get(metadata.denom)).toEqual({
    ...metadata,
    iconUrl: undefined,
  });
});

test("deduplicates overlapping hydration and refresh calls", async () => {
  const storage = new MemoryKVStore("registry-test");
  const loaded = deferred<unknown>();
  const get = jest.spyOn(storage, "get").mockReturnValue(loaded.promise);
  const fetched = deferred<Response>();
  const fetcher = successfulFetch().mockReturnValue(fetched.promise);
  const cache = new RouteRegistryCache(storage, fetcher, () => now);
  const hydration = cache.hydrate();
  expect(cache.hydrate()).toBe(hydration);
  const refresh = cache.refresh();
  expect(cache.refresh()).toBe(refresh);
  expect(get).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
  loaded.resolve(cached(0));
  await hydration;
  expect(cache.snapshot().get(metadata.denom)).toEqual(metadata);
  expect(cache.refresh()).toBe(refresh);
  fetched.resolve(new Response(document));
  await refresh;
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("storage read and write failures do not prevent valid in-memory data", async () => {
  const storage = new MemoryKVStore("registry-test");
  jest
    .spyOn(storage, "get")
    .mockRejectedValue(new Error("Storage unavailable"));
  jest.spyOn(storage, "set").mockRejectedValue(new Error("Storage full"));
  const fetcher = successfulFetch();
  const cache = new RouteRegistryCache(storage, fetcher, () => now);
  const listener = jest.fn();
  const unsubscribe = cache.subscribe(listener);
  await cache.refresh();
  expect(cache.snapshot().get(metadata.denom)).toEqual(metadata);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  await cache.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("a new cache instance restores the persisted snapshot while offline", async () => {
  const storage = new MemoryKVStore("registry-test");
  const original = new RouteRegistryCache(
    storage,
    successfulFetch(),
    () => now
  );
  await original.refresh();
  const offline = successfulFetch().mockRejectedValue(new Error("Offline"));
  const reopened = new RouteRegistryCache(storage, offline, () => now);
  await reopened.refresh();
  expect(reopened.snapshot().get(metadata.denom)).toEqual(metadata);
  expect(offline).not.toHaveBeenCalled();
});

test("shared refreshes notify subscribers without keeping removed listeners", async () => {
  const storage = new MemoryKVStore("registry-test");
  let time = now;
  const cache = new RouteRegistryCache(storage, successfulFetch(), () => time);
  const first = jest.fn();
  const second = jest.fn();
  const unsubscribe = cache.subscribe(first);
  cache.subscribe(second);
  await cache.refresh();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  unsubscribe();
  time += ROUTE_REGISTRY_TTL_MS;
  await cache.refresh();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
});

test.each(["HTTP failure", "invalid JSON", "wrong chain", "missing body"])(
  "keeps a valid previous snapshot after %s",
  async (failure) => {
    const storage = new MemoryKVStore("registry-test");
    await storage.set(ROUTE_REGISTRY_CACHE_KEY, cached(0));
    const responses: Record<string, Response> = {
      "HTTP failure": new Response("Unavailable", { status: 503 }),
      "invalid JSON": new Response("{"),
      "wrong chain": new Response(document.replace("osmosis", "cosmoshub")),
      "missing body": new Response(null),
    };
    const fetcher = successfulFetch().mockResolvedValue(responses[failure]);
    const cache = new RouteRegistryCache(storage, fetcher, () => now);
    await cache.hydrate();
    const snapshot = cache.snapshot();
    await cache.refresh();
    expect(cache.snapshot()).toBe(snapshot);
  }
);

test("rejects oversized declared bodies before opening the reader", async () => {
  const storage = new MemoryKVStore("registry-test");
  const response = new Response(document, {
    headers: { "content-length": String(MAX_OSMOSIS_REGISTRY_BYTES + 1) },
  });
  const body = response.body;
  if (!body) throw new Error("Missing test response body");
  const reader = jest.spyOn(body, "getReader");
  const fetcher = successfulFetch().mockResolvedValue(response);
  const cache = new RouteRegistryCache(storage, fetcher, () => now);
  await cache.refresh();
  expect(reader).not.toHaveBeenCalled();
  expect(cache.snapshot()).toBe(EMPTY_ROUTE_REGISTRY);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

test.each([undefined, "1"])(
  "bounds streamed bytes even when Content-Length is %s",
  async (length) => {
    const storage = new MemoryKVStore("registry-test");
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_OSMOSIS_REGISTRY_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    const headers = length ? { "content-length": length } : undefined;
    const fetcher = successfulFetch().mockResolvedValue(
      new Response(body, { headers })
    );
    const cache = new RouteRegistryCache(storage, fetcher, () => now);
    await cache.refresh();
    expect(cache.snapshot()).toBe(EMPTY_ROUTE_REGISTRY);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  }
);

test("accepts a valid document exactly at the byte limit", async () => {
  const storage = new MemoryKVStore("registry-test");
  const source =
    document +
    " ".repeat(
      MAX_OSMOSIS_REGISTRY_BYTES - new TextEncoder().encode(document).length
    );
  const fetcher = successfulFetch().mockResolvedValue(new Response(source));
  const cache = new RouteRegistryCache(storage, fetcher, () => now);
  await cache.refresh();
  expect(cache.snapshot().get(metadata.denom)).toEqual(metadata);
});

test("times out before headers and leaves a later retry available", async () => {
  jest.useFakeTimers();
  const storage = new MemoryKVStore("registry-test");
  const started = deferred<void>();
  const fetcher = successfulFetch().mockImplementationOnce(() => {
    started.resolve();
    return new Promise<Response>(() => undefined);
  });
  const cache = new RouteRegistryCache(storage, fetcher, () => Date.now());
  const refresh = cache.refresh();
  await started.promise;
  jest.advanceTimersByTime(ROUTE_REGISTRY_TIMEOUT_MS);
  await refresh;
  expect(cache.snapshot()).toBe(EMPTY_ROUTE_REGISTRY);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  jest.advanceTimersByTime(ROUTE_REGISTRY_RETRY_MS);
  await cache.refresh();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(cache.snapshot().get(metadata.denom)).toEqual(metadata);
});

test("keeps the timeout active while a response body stalls", async () => {
  jest.useFakeTimers();
  const storage = new MemoryKVStore("registry-test");
  const reading = deferred<void>();
  const cancel = jest.fn().mockResolvedValue(undefined);
  const reader = {
    read: jest.fn(() => {
      reading.resolve();
      return new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined);
    }),
    cancel,
  };
  const response = {
    ok: true,
    headers: new Headers(),
    body: { getReader: () => reader },
  } as unknown as Response;
  const fetcher = successfulFetch().mockResolvedValue(response);
  const cache = new RouteRegistryCache(storage, fetcher, () => Date.now());
  const refresh = cache.refresh();
  await reading.promise;
  jest.advanceTimersByTime(ROUTE_REGISTRY_TIMEOUT_MS);
  await refresh;
  expect(cache.snapshot()).toBe(EMPTY_ROUTE_REGISTRY);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
