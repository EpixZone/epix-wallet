import type { KVStore } from "@keplr-wallet/common";
import {
  MAX_OSMOSIS_REGISTRY_BYTES,
  OsmosisAssetMetadata,
  parseCachedOsmosisAssetMetadata,
  parseOsmosisAssetRegistry,
} from "./osmosis-asset-registry";

export const ROUTE_REGISTRY_URL =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/frontend/assetlist.json";
export const ROUTE_REGISTRY_CACHE_KEY = "osmosis-v1";
export const ROUTE_REGISTRY_TTL_MS = 24 * 60 * 60 * 1000;
export const ROUTE_REGISTRY_RETRY_MS = 5 * 60 * 1000;
export const ROUTE_REGISTRY_TIMEOUT_MS = 15_000;
export const EMPTY_ROUTE_REGISTRY: ReadonlyMap<string, OsmosisAssetMetadata> =
  new Map();

type Registry = ReadonlyMap<string, OsmosisAssetMetadata>;
type RegistryFetch = typeof fetch;
type CachedRegistry = {
  version: 1;
  fetchedAt: number;
  assets: readonly OsmosisAssetMetadata[];
};

function cachedRegistry(
  value: unknown,
  now: number
): CachedRegistry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const cache = value as Partial<CachedRegistry>;
  if (
    cache.version !== 1 ||
    typeof cache.fetchedAt !== "number" ||
    !Number.isSafeInteger(cache.fetchedAt) ||
    cache.fetchedAt < 0 ||
    cache.fetchedAt > now
  )
    return undefined;
  const assets = parseCachedOsmosisAssetMetadata(cache.assets);
  return {
    version: 1,
    fetchedAt: cache.fetchedAt,
    assets: [...assets.values()],
  };
}

async function readRegistryBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeout: Promise<never>
): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await Promise.race([reader.read(), timeout]);
    if (done) break;
    size += value.byteLength;
    if (size > MAX_OSMOSIS_REGISTRY_BYTES)
      throw new Error("Osmosis asset registry exceeds the document size limit");
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Bounds the decompressed body, including responses with no Content-Length. */
async function fetchRegistry(fetcher: RegistryFetch): Promise<Registry> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Osmosis asset registry request timed out"));
    }, ROUTE_REGISTRY_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      fetcher(ROUTE_REGISTRY_URL, {
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      }),
      timeout,
    ]);
    if (!response.ok || !response.body)
      throw new Error("Osmosis asset registry unavailable");
    const declaredSize = Number(response.headers.get("content-length"));
    if (declaredSize > MAX_OSMOSIS_REGISTRY_BYTES)
      throw new Error("Osmosis asset registry exceeds the document size limit");
    reader = response.body.getReader();
    const source = await readRegistryBody(reader, timeout);
    return parseOsmosisAssetRegistry(source);
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => undefined);
  }
}

function recently(timestamp: number | undefined, now: number, age: number) {
  return timestamp !== undefined && now >= timestamp && now - timestamp < age;
}

/** Optional display data. Cache and network failures never affect swap approval. */
export class RouteRegistryCache {
  private value: Registry = EMPTY_ROUTE_REGISTRY;
  private fetchedAt: number | undefined;
  private failedAt: number | undefined;
  private hydration: Promise<void> | undefined;
  private refreshing: Promise<void> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: Pick<KVStore, "get" | "set">,
    private readonly fetcher: RegistryFetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  snapshot(): Registry {
    return this.value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  hydrate(): Promise<void> {
    this.hydration ??= this.loadCache();
    return this.hydration;
  }

  refresh(): Promise<void> {
    this.refreshing ??= this.hydrate()
      .then(() => this.refreshIfDue())
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }

  private publish(value: Registry) {
    this.value = value;
    for (const listener of this.listeners) listener();
  }

  private async loadCache(): Promise<void> {
    try {
      const cached = cachedRegistry(
        await this.storage.get<unknown>(ROUTE_REGISTRY_CACHE_KEY),
        this.now()
      );
      if (cached) {
        this.fetchedAt = cached.fetchedAt;
        this.publish(
          new Map(cached.assets.map((asset) => [asset.denom, asset]))
        );
      }
    } catch {
      // Invalid or unavailable persistence leaves bundled display metadata usable.
    }
  }

  private async refreshIfDue(): Promise<void> {
    const now = this.now();
    if (
      recently(this.fetchedAt, now, ROUTE_REGISTRY_TTL_MS) ||
      recently(this.failedAt, now, ROUTE_REGISTRY_RETRY_MS)
    )
      return;
    try {
      const assets = await fetchRegistry(this.fetcher);
      this.fetchedAt = this.now();
      this.failedAt = undefined;
      this.publish(assets);
      // A storage failure must not discard a valid in-memory registry or hold up
      // subscribers. Only compact, revalidated display fields are persisted.
      void this.storage
        .set<CachedRegistry>(ROUTE_REGISTRY_CACHE_KEY, {
          version: 1,
          fetchedAt: this.fetchedAt,
          assets: [...assets.values()],
        })
        .catch(() => undefined);
    } catch {
      this.failedAt = this.now();
    }
  }
}
