import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SwapQuoteRoute, SwapRouteSearch } from "./swap-quote-route";
import { quoteRouteView } from "./quote-route";
import { OSMOSIS_SWAP_TOKENS } from "./tokens";

jest.mock("../../public/assets/logo-256.png", () => "epix.png");
jest.mock("../../public/assets/img/ethereum.svg", () => "ethereum.svg");
jest.mock("../../public/assets/img/route-usdc.svg", () => "route-usdc.svg");
jest.mock("../../public/assets/img/route-btc.svg", () => "route-btc.svg");
jest.mock("../../public/assets/img/route-osmo.svg", () => "route-osmo.svg");
jest.mock("../../public/assets/img/route-usdt.svg", () => "route-usdt.svg");

const t = (key: string) => key;
const epix = OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom;
const allUsdt = OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom;
const reverse =
  quoteRouteView(
    [{ poolId: "3486", tokenOutDenom: epix }],
    undefined,
    allUsdt
  ) ?? [];

it("keeps the forward bridge before the pool path inside a collapsed disclosure", () => {
  const routes =
    quoteRouteView([{ poolId: "3486", tokenOutDenom: allUsdt }]) ?? [];
  const html = renderToStaticMarkup(<SwapQuoteRoute t={t} routes={routes} />);
  expect(html).toContain("route-ibc-bridge");
  expect(html).toContain('role="region"');
  expect(html.indexOf("route-ibc-bridge")).toBeLessThan(
    html.indexOf('role="region"')
  );
  expect(html).toContain("route-preview-help");
  expect(html).toContain('<section aria-label="estimated-route"');
  expect(html).toContain("<details");
  expect(html).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
});

it("places reverse pool execution before the Osmosis to Epix bridge", () => {
  const html = renderToStaticMarkup(
    <SwapQuoteRoute t={t} routes={reverse} direction="to-epix" />
  );
  expect(html).toContain('role="region"');
  expect(html).toContain("route-bridge-return");
  expect(html.indexOf('role="region"')).toBeLessThan(
    html.indexOf("route-bridge-return")
  );
  const bridge = html.slice(html.indexOf("route-bridge-return"));
  expect(bridge.indexOf(">Osmosis<")).toBeLessThan(bridge.indexOf(">Epix<"));
  expect(html).toContain("USDT (allUSDT)");
  expect(html).toContain(`title="${epix}"`);
  expect(html).toContain("route-return-help");
  expect(html).not.toContain("route-preview-help");
});

it("shows only the remaining bridge after a completed reverse swap", () => {
  const html = renderToStaticMarkup(
    <SwapQuoteRoute t={t} routes={reverse} direction="to-epix" swapComplete />
  );
  expect(html).toContain("route-swap-complete");
  expect(html).toContain("route-bridge-return");
  expect(html).toContain("route-return-resume-help");
  expect(html).not.toContain('role="region"');
  expect(html).not.toContain("route-details");
  expect(html).not.toContain("route-pool");
  expect(
    renderToStaticMarkup(
      <SwapQuoteRoute t={t} routes={[]} direction="to-epix" swapComplete />
    )
  ).toContain("route-bridge-return");
});

it("uses the selected reverse input while searching without changing the forward default", () => {
  const html = renderToStaticMarkup(
    <SwapRouteSearch t={t} inputToken="USDT (allUSDT)" outputToken="EPIX" />
  );
  expect(html.indexOf("USDT (allUSDT)")).toBeLessThan(html.indexOf(">EPIX<"));
  expect(
    renderToStaticMarkup(<SwapRouteSearch t={t} outputToken="OSMO" />)
  ).toContain(">EPIX<");
});

it("uses the bundled Epix icon for the exact alloyed input while keeping its distinct label", () => {
  const alloyed = OSMOSIS_SWAP_TOKENS[6].coinMinimalDenom;
  const routes =
    quoteRouteView(
      [{ poolId: "3471", tokenOutDenom: epix }],
      undefined,
      alloyed
    ) ?? [];
  const html = renderToStaticMarkup(
    <SwapQuoteRoute t={t} routes={routes} direction="to-epix" />
  );
  expect(html).toContain(`title="${alloyed}"`);
  expect(html).toContain("EPIX (allEPIX)");
  expect(html.match(/src="epix.png"/g)).toHaveLength(2);
});
