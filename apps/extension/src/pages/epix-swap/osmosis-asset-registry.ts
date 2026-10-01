/** Limits also used by the fetcher before replacing its last valid snapshot. */
export const MAX_OSMOSIS_REGISTRY_BYTES = 5 * 1024 * 1024;
export const MAX_OSMOSIS_REGISTRY_ASSETS = 5_000;

export type OsmosisAssetMetadata = Readonly<{
  denom: string;
  symbol: string;
  name: string;
  iconUrl?: string;
  isAlloyed: boolean;
}>;

const RAW_GITHUB_PREFIX = "https://raw.githubusercontent.com/";
const ICON_REPOSITORIES = new Set([
  "cosmos/chain-registry",
  "osmosis-labs/assetlists",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDisplayString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)
  );
}

function isIconUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 2_048 ||
    !value.startsWith(RAW_GITHUB_PREFIX)
  ) {
    return false;
  }
  // Check the original path before a URL parser could normalize traversal.
  // This grammar also excludes credentials, ports, escapes, queries and fragments.
  const segments = value.slice(RAW_GITHUB_PREFIX.length).split("/");
  const [owner, repository, revision] = segments;
  return (
    segments.length >= 4 &&
    ICON_REPOSITORIES.has(`${owner}/${repository}`) &&
    /^(?:main|master|[a-fA-F0-9]{40})$/.test(revision) &&
    segments.every(
      (segment) =>
        /^[A-Za-z0-9_.-]+$/.test(segment) && segment !== "." && segment !== ".."
    ) &&
    /\.(?:svg|png|jpe?g|webp|gif|avif)$/i.test(value)
  );
}

function iconUrl(logos: unknown): string | undefined {
  if (!isRecord(logos)) return undefined;
  if (isIconUrl(logos["svg"])) return logos["svg"];
  if (isIconUrl(logos["png"])) return logos["png"];
  return undefined;
}

function metadataIcon(
  value: Record<string, unknown>,
  fromCache: boolean
): string | undefined {
  if (fromCache)
    return isIconUrl(value["iconUrl"]) ? value["iconUrl"] : undefined;
  return iconUrl(value["logoURIs"]);
}

function parseAsset(
  value: unknown,
  fromCache: boolean
): OsmosisAssetMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const denom = fromCache ? value["denom"] : value["coinMinimalDenom"];
  if (
    !isDisplayString(denom, 512) ||
    /\s/u.test(denom) ||
    !isDisplayString(value["symbol"], 64) ||
    !isDisplayString(value["name"], 256) ||
    (value["isAlloyed"] !== undefined &&
      typeof value["isAlloyed"] !== "boolean")
  ) {
    return undefined;
  }
  return Object.freeze({
    denom,
    symbol: value["symbol"],
    name: value["name"],
    iconUrl: metadataIcon(value, fromCache),
    isAlloyed: value["isAlloyed"] === true,
  });
}

function sameMetadata(
  a: OsmosisAssetMetadata,
  b: OsmosisAssetMetadata
): boolean {
  return (
    a.symbol === b.symbol &&
    a.name === b.name &&
    a.iconUrl === b.iconUrl &&
    a.isAlloyed === b.isAlloyed
  );
}

function registryAssets(source: string): unknown[] {
  if (
    source.length > MAX_OSMOSIS_REGISTRY_BYTES ||
    new TextEncoder().encode(source).length > MAX_OSMOSIS_REGISTRY_BYTES
  ) {
    throw new Error("Osmosis asset registry exceeds the document size limit");
  }
  const document: unknown = JSON.parse(source);
  if (
    !isRecord(document) ||
    document["chainName"] !== "osmosis" ||
    !Array.isArray(document["assets"])
  ) {
    throw new Error("Invalid Osmosis asset registry document");
  }
  return document["assets"];
}

function parseAssets(
  values: unknown,
  fromCache: boolean
): ReadonlyMap<string, OsmosisAssetMetadata> {
  if (!Array.isArray(values) || values.length > MAX_OSMOSIS_REGISTRY_ASSETS) {
    throw new Error("Invalid Osmosis asset registry entries");
  }
  const assets = new Map<string, OsmosisAssetMetadata>();
  const ambiguous = new Set<string>();
  for (const value of values) {
    const asset = parseAsset(value, fromCache);
    if (!asset || ambiguous.has(asset.denom)) continue;
    const previous = assets.get(asset.denom);
    if (previous && !sameMetadata(previous, asset)) {
      assets.delete(asset.denom);
      ambiguous.add(asset.denom);
    } else {
      assets.set(asset.denom, asset);
    }
  }
  if (assets.size === 0) {
    throw new Error(
      "Osmosis asset registry contains no valid display metadata"
    );
  }
  return assets;
}

/** Display metadata only. Never use this registry to authorize assets or fees. */
export function parseOsmosisAssetRegistry(
  source: string
): ReadonlyMap<string, OsmosisAssetMetadata> {
  return parseAssets(registryAssets(source), false);
}

/** Revalidate compact public cache entries with the same limits as fresh data. */
export function parseCachedOsmosisAssetMetadata(
  value: unknown
): ReadonlyMap<string, OsmosisAssetMetadata> {
  return parseAssets(value, true);
}
