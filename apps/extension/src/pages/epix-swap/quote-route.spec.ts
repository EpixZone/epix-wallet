import { quoteRouteView } from "./quote-route";
import { OSMOSIS_SWAP_TOKENS } from "./tokens";

const epix = OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom;
const usdc = OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom;
const allEth =
  "factory/osmo1k6c8jln7ejuqwtqmay3yvzrg3kueaczl96pk067ldg8u835w0yhsw27twm/alloyed/allETH";
const allUsdt =
  "factory/osmo1em6xs47hd82806f5cxgyufguxrrc7l0aqx7nzzptjuqgswczk8csavdxek/alloyed/allUSDT";
const allUsdc =
  "factory/osmo147h5x9pcj7lm0cttlaefx6sqq5vdfnmwfcqxkmjd7exqm9gc7grqhr75m0/alloyed/allUSDC";

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
  ).toBe(false);
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
