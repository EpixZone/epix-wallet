import { useEffect, useState } from "react";
import { ExtensionKVStore } from "@keplr-wallet/common";
import type { OsmosisAssetMetadata } from "./osmosis-asset-registry";
import {
  EMPTY_ROUTE_REGISTRY,
  ROUTE_REGISTRY_RETRY_MS,
  RouteRegistryCache,
} from "./route-registry-cache";

let sharedCache: RouteRegistryCache | undefined;

function getCache(): RouteRegistryCache | undefined {
  if (sharedCache) return sharedCache;
  if (typeof browser === "undefined" || !browser.storage?.local) return;
  try {
    sharedCache = new RouteRegistryCache(
      new ExtensionKVStore("epix-swap-route-registry")
    );
    return sharedCache;
  } catch {
    // Pure previews and unavailable extension storage keep the bundled fallback.
    return undefined;
  }
}

/** Enriches a visible route without adding a dependency to quote preparation. */
export function useRouteRegistry(
  active: boolean
): ReadonlyMap<string, OsmosisAssetMetadata> {
  const [assets, setAssets] = useState(
    () => sharedCache?.snapshot() ?? EMPTY_ROUTE_REGISTRY
  );
  useEffect(() => {
    if (!active) return;
    const cache = getCache();
    if (!cache) return;
    const update = () => setAssets(cache.snapshot());
    const unsubscribe = cache.subscribe(update);
    update();
    // Hydration publishes immediately; the deduped refresh then checks its TTL.
    void cache.refresh();
    const timer = setInterval(
      () => void cache.refresh(),
      ROUTE_REGISTRY_RETRY_MS
    );
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [active]);
  return assets;
}
