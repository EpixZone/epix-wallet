import { quoteRouteView } from "./quote-route";
import { OSMOSIS_SWAP_TOKENS } from "./tokens";
import { parseOsmosisAssetRegistry } from "./osmosis-asset-registry";

const epix = OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom;
const usdc = OSMOSIS_SWAP_TOKENS[5].coinMinimalDenom;
const allEth =
  "factory/osmo1k6c8jln7ejuqwtqmay3yvzrg3kueaczl96pk067ldg8u835w0yhsw27twm/alloyed/allETH";
const allUsdt =
  "factory/osmo1em6xs47hd82806f5cxgyufguxrrc7l0aqx7nzzptjuqgswczk8csavdxek/alloyed/allUSDT";
const allUsdc =
  "factory/osmo147h5x9pcj7lm0cttlaefx6sqq5vdfnmwfcqxkmjd7exqm9gc7grqhr75m0/alloyed/allUSDC";

it("starts a reverse path at the exact selected Osmosis asset", () => {
  expect(
    quoteRouteView(
      [
        { poolId: "3507", tokenOutDenom: allUsdt },
        { poolId: "3486", tokenOutDenom: epix },
      ],
      undefined,
      allUsdc
    )
  ).toEqual([
    {
      poolId: "3507",
      tokenIn: "USDC (allUSDC)",
      tokenOut: "USDT (allUSDT)",
      tokenInDenom: allUsdc,
      tokenOutDenom: allUsdt,
    },
    {
      poolId: "3486",
      tokenIn: "USDT (allUSDT)",
      tokenOut: "EPIX",
      tokenInDenom: allUsdt,
      tokenOutDenom: epix,
    },
  ]);
});

it("keeps alloyed EPIX distinct from the bridgeable EPIX produced by its pool", () => {
  const alloyed = OSMOSIS_SWAP_TOKENS[6].coinMinimalDenom;
  expect(
    quoteRouteView(
      [{ poolId: "3471", tokenOutDenom: epix }],
      undefined,
      alloyed
    )?.[0]
  ).toMatchObject({
    tokenIn: "EPIX (allEPIX)",
    tokenInDenom: alloyed,
    tokenOut: "EPIX",
    tokenOutDenom: epix,
  });
});

it("does not guess the label of an unknown reverse input", () => {
  const unknown = allUsdt.replace("osmo1em6", "osmo1other");
  const hop = quoteRouteView(
    [{ poolId: "1", tokenOutDenom: epix }],
    undefined,
    unknown
  )?.[0];
  expect(hop?.tokenIn).toBe(`${unknown.slice(0, 12)}…${unknown.slice(-8)}`);
  expect(hop?.tokenInDenom).toBe(unknown);
});

it("maps a direct route from exact Osmosis EPIX and preserves a uint64 pool ID", () => {
  expect(
    quoteRouteView([{ poolId: "18446744073709551615", tokenOutDenom: "uosmo" }])
  ).toEqual([
    {
      poolId: "18446744073709551615",
      tokenIn: "EPIX",
      tokenOut: "OSMO",
      tokenInDenom: epix,
      tokenOutDenom: "uosmo",
    },
  ]);
});

it("carries each exact output into the next hop without changing the quoted path", () => {
  const routes = Object.freeze([
    Object.freeze({ poolId: "3351", tokenOutDenom: "uosmo" }),
    Object.freeze({ poolId: "3567", tokenOutDenom: usdc }),
  ]);
  expect(quoteRouteView(routes)).toEqual([
    {
      poolId: "3351",
      tokenIn: "EPIX",
      tokenOut: "OSMO",
      tokenInDenom: epix,
      tokenOutDenom: "uosmo",
    },
    {
      poolId: "3567",
      tokenIn: "OSMO",
      tokenOut: "USDC",
      tokenInDenom: "uosmo",
      tokenOutDenom: usdc,
    },
  ]);
});

it("uses an honest shortened denomination for unknown intermediates and retains the full value", () => {
  const unknown = `ibc/${"0123456789ABCDEF".repeat(4)}`;
  const routes = quoteRouteView([
    { poolId: "1", tokenOutDenom: unknown },
    { poolId: "2", tokenOutDenom: usdc },
  ]);
  expect(routes?.[0].tokenOut).toBe("ibc/01234567…89ABCDEF");
  expect(routes?.[1].tokenIn).toBe("ibc/01234567…89ABCDEF");
  expect(routes?.[0].tokenOutDenom).toBe(unknown);
  expect(routes?.[1].tokenInDenom).toBe(unknown);
  expect(routes?.[1].tokenOut).toBe("USDC");
});

it("labels the verified allETH intermediate without changing its denomination or adding a selectable asset", () => {
  const routes = quoteRouteView([
    { poolId: "3351", tokenOutDenom: allEth },
    { poolId: "1980", tokenOutDenom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom },
  ]);
  expect(routes?.[0]).toMatchObject({
    tokenIn: "EPIX",
    tokenOut: "ETH (allETH)",
    tokenOutDenom: allEth,
  });
  expect(routes?.[1]).toMatchObject({
    tokenIn: "ETH (allETH)",
    tokenInDenom: allEth,
    tokenOut: "BTC",
  });
  expect(
    OSMOSIS_SWAP_TOKENS.some((token) => token.coinMinimalDenom === allEth)
  ).toBe(false);
});

it.each([
  allEth.replace("osmo1k6c8", "osmo1other"),
  allEth.replace("allETH", "alleth"),
])(
  "does not apply the verified allETH label to a different exact denomination",
  (denom) => {
    const hop = quoteRouteView([{ poolId: "1", tokenOutDenom: denom }])?.[0];
    expect(hop?.tokenOut).not.toBe("ETH (allETH)");
    expect(hop?.tokenOut).toBe(`${denom.slice(0, 12)}…${denom.slice(-8)}`);
    expect(hop?.tokenOutDenom).toBe(denom);
  }
);

it.each([
  [allUsdt, "USDT (allUSDT)"],
  [allUsdc, "USDC (allUSDC)"],
])("labels only the verified alloyed stablecoin %s", (denom, label) => {
  const route = quoteRouteView([
    { poolId: "3486", tokenOutDenom: denom },
    { poolId: "3502", tokenOutDenom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom },
  ]);
  expect(route?.[0]).toMatchObject({
    tokenIn: "EPIX",
    tokenOut: label,
    tokenOutDenom: denom,
  });
  expect(route?.[1]).toMatchObject({
    tokenIn: label,
    tokenInDenom: denom,
    tokenOut: "BTC",
  });
  expect(
    OSMOSIS_SWAP_TOKENS.some((token) => token.coinMinimalDenom === denom)
  ).toBe(true);
});

it.each([
  allUsdt.replace("osmo1em6", "osmo1other"),
  allUsdt.replace("allUSDT", "allusdt"),
  allUsdc.replace("osmo147h", "osmo1other"),
  allUsdc.replace("allUSDC", "allusdc"),
])("keeps an unverified stablecoin denomination unknown: %s", (denom) => {
  const hop = quoteRouteView([{ poolId: "1", tokenOutDenom: denom }])?.[0];
  expect(hop?.tokenOut).toBe(`${denom.slice(0, 12)}…${denom.slice(-8)}`);
  expect(hop?.tokenOutDenom).toBe(denom);
});

it("does not guess known symbols from an unmatched or differently cased denomination", () => {
  expect(
    quoteRouteView([{ poolId: "1", tokenOutDenom: "UOSMO" }])?.[0].tokenOut
  ).toBe("UOSMO");
  expect(
    quoteRouteView([{ poolId: "1", tokenOutDenom: "aepix" }])?.[0].tokenOut
  ).toBe("aepix");
});

it("keeps absent routes compatible and never displays a partial overlong path", () => {
  expect(quoteRouteView()).toBeUndefined();
  expect(quoteRouteView([])).toBeUndefined();
  const maximum = Array.from({ length: 8 }, (_, index) => ({
    poolId: String(index + 1),
    tokenOutDenom: `unknown-${index + 1}`,
  }));
  const result = quoteRouteView(maximum);
  expect(result).toHaveLength(8);
  expect(result?.[7]).toMatchObject({
    poolId: "8",
    tokenInDenom: "unknown-7",
    tokenOutDenom: "unknown-8",
  });
  expect(
    quoteRouteView([...maximum, { poolId: "9", tokenOutDenom: usdc }])
  ).toBeUndefined();
});

it("enriches exact registered denominations without altering the quoted path or bundled labels", () => {
  const atom =
    "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";
  const registry = parseOsmosisAssetRegistry(
    JSON.stringify({
      chainName: "osmosis",
      assets: [
        { coinMinimalDenom: atom, symbol: "ATOM", name: "Cosmos Hub" },
        { coinMinimalDenom: allUsdt, symbol: "changed", name: "Changed label" },
        { coinMinimalDenom: "uosmo", symbol: "changed", name: "Changed label" },
      ],
    })
  );
  const path = Object.freeze([
    Object.freeze({ poolId: "18446744073709551615", tokenOutDenom: atom }),
    Object.freeze({ poolId: "2", tokenOutDenom: allUsdt }),
    Object.freeze({ poolId: "3", tokenOutDenom: "uosmo" }),
  ]);
  const route = quoteRouteView(path, registry);
  expect(
    route?.map(({ poolId, tokenOutDenom }) => ({ poolId, tokenOutDenom }))
  ).toEqual(path);
  expect(route?.[0].tokenOut).toBe("ATOM");
  expect(route?.[1].tokenInMetadata).toBe(registry.get(atom));
  expect(route?.[1].tokenOut).toBe("USDT (allUSDT)");
  expect(route?.[2].tokenOut).toBe("OSMO");
  expect(
    quoteRouteView(
      [{ poolId: "1", tokenOutDenom: atom.toLowerCase() }],
      registry
    )?.[0].tokenOut
  ).not.toBe("ATOM");
  expect(
    OSMOSIS_SWAP_TOKENS.some((token) => token.coinMinimalDenom === atom)
  ).toBe(false);
});
