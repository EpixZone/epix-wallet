import {
  MAX_OSMOSIS_REGISTRY_ASSETS,
  MAX_OSMOSIS_REGISTRY_BYTES,
  parseCachedOsmosisAssetMetadata,
  parseOsmosisAssetRegistry,
} from "./osmosis-asset-registry";

const registryRoot = "https://raw.githubusercontent.com/cosmos/chain-registry";
const pinnedRevision = "cc1ed04b31326bc79f3208e571fb71fa0fddb987";
const usdtDenom =
  "factory/osmo1em6xs47hd82806f5cxgyufguxrrc7l0aqx7nzzptjuqgswczk8csavdxek/alloyed/allUSDT";
const usdcDenom =
  "factory/osmo147h5x9pcj7lm0cttlaefx6sqq5vdfnmwfcqxkmjd7exqm9gc7grqhr75m0/alloyed/allUSDC";
const epixDenom =
  "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF";
const osmo = {
  coinMinimalDenom: "uosmo",
  symbol: "OSMO",
  name: "Osmosis",
  logoURIs: { svg: `${registryRoot}/master/osmosis/images/osmo.svg` },
  isAlloyed: false,
};

function document(assets: unknown[]): string {
  return JSON.stringify({ chainName: "osmosis", assets });
}

it("maps exact native, IBC and alloyed denoms from the generated frontend schema", () => {
  // Primary data: osmosis-labs/assetlists at 3dc2e9f3c5976147eb1cc1516d193bf4b24182a5,
  // osmosis-1/generated/frontend/assetlist.json. No symbol/suffix inference.
  const assets = parseOsmosisAssetRegistry(
    document([
      osmo,
      {
        coinMinimalDenom: usdtDenom,
        symbol: "USDT",
        name: "Tether USD",
        logoURIs: {
          svg: `${registryRoot}/master/_non-cosmos/ethereum/images/usdt.svg`,
        },
        isAlloyed: true,
      },
      {
        coinMinimalDenom: usdcDenom,
        symbol: "USDC",
        name: "USDC",
        logoURIs: {
          svg: `${registryRoot}/${pinnedRevision}/_non-cosmos/ethereum/images/usdc.svg`,
        },
        isAlloyed: true,
      },
      {
        coinMinimalDenom: epixDenom,
        symbol: "EPIX.epix",
        name: "Epix (Epix)",
        logoURIs: { png: `${registryRoot}/master/epix/images/epix.png` },
      },
    ])
  );
  expect(assets.size).toBe(4);
  expect(assets.get(usdtDenom)).toEqual({
    denom: usdtDenom,
    symbol: "USDT",
    name: "Tether USD",
    isAlloyed: true,
    iconUrl: `${registryRoot}/master/_non-cosmos/ethereum/images/usdt.svg`,
  });
  expect(assets.get(usdcDenom)?.iconUrl).toContain(pinnedRevision);
  expect(assets.get(epixDenom)?.symbol).toBe("EPIX.epix");
  expect(assets.has(epixDenom.toLowerCase())).toBe(false);
  expect(assets.has("allUSDT")).toBe(false);
  expect(assets.has(usdtDenom.replace("osmo1em6", "osmo1other"))).toBe(false);
  expect(Object.isFrozen(assets.get(usdtDenom))).toBe(true);
});

it("keeps valid metadata when icons are absent or invalid, using a valid PNG fallback", () => {
  const noIcon = { ...osmo, logoURIs: undefined };
  expect(parseOsmosisAssetRegistry(document([noIcon])).get("uosmo")).toEqual({
    denom: "uosmo",
    symbol: "OSMO",
    name: "Osmosis",
    isAlloyed: false,
    iconUrl: undefined,
  });
  const png =
    "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/images/osmo.png";
  expect(
    parseOsmosisAssetRegistry(
      document([
        {
          ...osmo,
          logoURIs: { svg: "javascript:alert(1)", png },
        },
      ])
    ).get("uosmo")?.iconUrl
  ).toBe(png);
});

it.each([
  "http://raw.githubusercontent.com/cosmos/chain-registry/master/osmo.svg",
  "https://raw.githubusercontent.com.evil.test/cosmos/chain-registry/master/osmo.svg",
  "https://raw.githubusercontent.com@evil.test/cosmos/chain-registry/master/osmo.svg",
  "https://user:password@raw.githubusercontent.com/cosmos/chain-registry/master/osmo.svg",
  "https://raw.githubusercontent.com:443/cosmos/chain-registry/master/osmo.svg",
  "https://raw.githubusercontent.com:8443/cosmos/chain-registry/master/osmo.svg",
  "https://raw.githubusercontent.com/other/chain-registry/master/osmo.svg",
  `${registryRoot}/untrusted-branch/osmo.svg`,
  `${registryRoot}/master/../osmo.svg`,
  `${registryRoot}/master/./osmo.svg`,
  `${registryRoot}/master/%2e%2e/osmo.svg`,
  `${registryRoot}/master/images%2fosmo.svg`,
  `${registryRoot}/master/images\\osmo.svg`,
  `${registryRoot}/master/osmo.svg?download=1`,
  `${registryRoot}/master/osmo.svg#fragment`,
  `${registryRoot}/master/osmo.html`,
  `${registryRoot}/master/${"x".repeat(2_048)}.svg`,
  `${registryRoot}/master/osmo\u202e.svg`,
  ` ${registryRoot}/master/osmo.svg`,
  "javascript:alert(1)",
  "data:image/svg+xml,<svg/>",
  "file:///etc/passwd",
  "https://127.0.0.1/osmo.svg",
])("omits an unsafe icon URL: %s", (svg) => {
  const asset = parseOsmosisAssetRegistry(
    document([{ ...osmo, logoURIs: { svg } }])
  ).get("uosmo");
  expect(asset?.symbol).toBe("OSMO");
  expect(asset?.iconUrl).toBeUndefined();
});

it.each([
  { coinMinimalDenom: "" },
  { coinMinimalDenom: "u osmo" },
  { coinMinimalDenom: "a".repeat(513) },
  { coinMinimalDenom: "uosmo\u0000" },
  { symbol: "" },
  { symbol: " OSMO" },
  { symbol: "a".repeat(65) },
  { symbol: "OS\u202eMO" },
  { symbol: "OS\u2066MO" },
  { symbol: "OS\u200bMO" },
  { name: "Osmosis\nNative" },
  { name: "Osmosis\u2028Native" },
  { name: "Osmosis\u2029Native" },
  { name: "a".repeat(257) },
  { name: 123 },
  { isAlloyed: "true" },
])(
  "skips invalid fields without removing other valid assets: %p",
  (invalid) => {
    const assets = parseOsmosisAssetRegistry(
      document([
        { ...osmo, coinMinimalDenom: "safe-token" },
        { ...osmo, ...invalid },
      ])
    );
    expect([...assets.keys()]).toEqual(["safe-token"]);
  }
);

it("deduplicates identical metadata but removes every ambiguous exact denom", () => {
  const same = { ...osmo, ignoredUnknownField: "does not affect display" };
  expect(parseOsmosisAssetRegistry(document([osmo, same])).size).toBe(1);
  const assets = parseOsmosisAssetRegistry(
    document([
      osmo,
      { ...osmo, symbol: "IMPOSTOR" },
      osmo,
      { ...osmo, coinMinimalDenom: "safe-token" },
    ])
  );
  expect([...assets.keys()]).toEqual(["safe-token"]);
});

it.each([
  { name: "Different name" },
  { logoURIs: { png: `${registryRoot}/master/osmosis/images/osmo.png` } },
  { isAlloyed: true },
])("rejects conflicting duplicate display fields: %p", (change) => {
  expect(() =>
    parseOsmosisAssetRegistry(document([osmo, { ...osmo, ...change }]))
  ).toThrow("no valid display metadata");
});

it.each([
  "",
  "{",
  "null",
  "[]",
  JSON.stringify({ assets: [osmo] }),
  JSON.stringify({ chainName: "other", assets: [osmo] }),
  JSON.stringify({ chainName: "osmosis", assets: {} }),
  document([]),
  document([null, [], {}, "asset"]),
])(
  "rejects malformed or empty documents rather than replacing a valid cache: %s",
  (source) => {
    expect(() => parseOsmosisAssetRegistry(source)).toThrow();
  }
);

it("enforces asset count and UTF-8 document size before accepting a snapshot", () => {
  expect(() =>
    parseOsmosisAssetRegistry(
      document(
        Array.from({ length: MAX_OSMOSIS_REGISTRY_ASSETS + 1 }, () => osmo)
      )
    )
  ).toThrow("Invalid Osmosis asset registry entries");
  expect(() =>
    parseOsmosisAssetRegistry(" ".repeat(MAX_OSMOSIS_REGISTRY_BYTES + 1))
  ).toThrow("document size limit");
  const multibyte = JSON.stringify({
    chainName: "osmosis",
    assets: [osmo],
    padding: "界".repeat(Math.floor(MAX_OSMOSIS_REGISTRY_BYTES / 3)),
  });
  expect(multibyte.length).toBeLessThan(MAX_OSMOSIS_REGISTRY_BYTES);
  expect(() => parseOsmosisAssetRegistry(multibyte)).toThrow(
    "document size limit"
  );
});

it("roundtrips compact cache entries through the same field and icon validation", () => {
  const fresh = parseOsmosisAssetRegistry(document([osmo]));
  const cached = JSON.parse(JSON.stringify([...fresh.values()]));
  expect(parseCachedOsmosisAssetMetadata(cached)).toEqual(fresh);
  expect(
    parseCachedOsmosisAssetMetadata([
      { ...cached[0], iconUrl: "https://localhost/private" },
    ]).get("uosmo")?.iconUrl
  ).toBeUndefined();
  expect(() =>
    parseCachedOsmosisAssetMetadata([{ ...cached[0], symbol: "bad\u202e" }])
  ).toThrow();
  expect(() =>
    parseCachedOsmosisAssetMetadata([
      cached[0],
      { ...cached[0], symbol: "different" },
    ])
  ).toThrow();
  expect(() =>
    parseCachedOsmosisAssetMetadata(
      Array.from({ length: MAX_OSMOSIS_REGISTRY_ASSETS + 1 }, () => cached[0])
    )
  ).toThrow();
});

it.each([null, {}, [], [osmo]])(
  "rejects invalid compact cache collections: %p",
  (value) => {
    expect(() => parseCachedOsmosisAssetMetadata(value)).toThrow();
  }
);
