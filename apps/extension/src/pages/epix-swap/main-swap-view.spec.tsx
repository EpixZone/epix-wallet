import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EpixMainSwapView,
  EpixMainSwapViewProps,
  SwapWorkflowProgress,
} from "./main-swap-view";
import { quoteRouteView } from "./quote-route";
import { parseOsmosisAssetRegistry } from "./osmosis-asset-registry";

jest.mock("../../public/assets/logo-256.png", () => "epix.png");
jest.mock("../../public/assets/img/ethereum.svg", () => "ethereum.svg");
jest.mock("../../public/assets/img/route-usdc.svg", () => "route-usdc.svg");
jest.mock("../../public/assets/img/route-btc.svg", () => "route-btc.svg");
jest.mock("../../public/assets/img/route-osmo.svg", () => "route-osmo.svg");
jest.mock("../../public/assets/img/route-usdt.svg", () => "route-usdt.svg");

jest.mock("../main/layouts/header", () => ({
  MainHeaderLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock("../../components/button", () => ({
  Button: ({ text, disabled }: { text: string; disabled?: boolean }) => (
    <button disabled={disabled}>{text}</button>
  ),
}));
jest.mock("../../components/input", () => ({
  TextInput: ({
    label,
    value,
    disabled,
  }: {
    label: string;
    value: string;
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <input value={value} disabled={disabled} readOnly />
    </label>
  ),
}));

const props: EpixMainSwapViewProps = {
  t: (key) => key,
  selection: {
    direction: "to-osmosis",
    inputDenom: "aepix",
    amount: "1",
    outputDenom: "usdc",
    slippageBps: 100,
    feeDenom: "uosmo",
  },
  tokenOptions: [
    { denom: "usdc", label: "USDC" },
    { denom: "btc", label: "BTC (allBTC)" },
    { denom: "uosmo", label: "OSMO" },
  ],
  feeOptions: [{ denom: "uosmo", label: "OSMO" }],
  availableBalance: "1,000 EPIX",
  destinationAddress: "osmo-public-test",
  osmosisEnabled: true,
  quoteState: "ready",
  quote: {
    expectedOutput: "0.00007 USDC",
    minimumOutput: "0.00006 USDC",
    bridgeNetworkFee: "0.003 EPIX",
    osmosisNetworkFeeLimit: "0.03 OSMO",
  },
  controlsDisabled: false,
  canConfirm: true,
  confirming: false,
  onSelectionChange: jest.fn(),
  onConfirm: jest.fn(),
  onRefresh: jest.fn(),
};

it("shows one swap form and quote with an explicit destination fee cap", () => {
  const html = renderToStaticMarkup(<EpixMainSwapView {...props} />);
  expect(html).toContain("0.00007 USDC");
  expect(html).toContain("0.00006 USDC");
  expect(html).toContain("0.03 OSMO");
  expect(html).toContain("osmosis-network-fee");
  expect(html).toContain("destination-enabled");
  expect(html).toContain("<button>swap</button>");
  expect(html).not.toContain("<button>deposit</button>");
  expect(html).not.toContain("<button>withdraw</button>");
});

it("keeps the estimate visible when missing fee funds block confirmation", () => {
  const html = renderToStaticMarkup(
    <EpixMainSwapView
      {...props}
      canConfirm={false}
      blockReason="Add OSMO before swapping"
    />
  );
  expect(html).toContain("0.00007 USDC");
  expect(html).toContain("Add OSMO before swapping");
  expect(html).toContain('<button disabled="">swap</button>');
});

const routedQuote = {
  ...props.quote,
  expectedOutput: "0.00007 USDC",
  minimumOutput: "0.00006 USDC",
  routes: [
    {
      poolId: "2143",
      tokenIn: "EPIX",
      tokenOut: "OSMO",
      tokenInDenom: "ibc/epix",
      tokenOutDenom: "uosmo",
    },
    {
      poolId: "678",
      tokenIn: "OSMO",
      tokenOut: "USDC",
      tokenInDenom: "uosmo",
      tokenOutDenom: "ibc/usdc",
    },
  ],
};

it("renders registry-only icons while preferring bundled icons and labels for known tokens", () => {
  const atom =
    "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";
  const atomIcon =
    "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.svg";
  const remoteOsmo =
    "https://raw.githubusercontent.com/cosmos/chain-registry/master/osmosis/images/osmo.svg";
  const registry = parseOsmosisAssetRegistry(
    JSON.stringify({
      chainName: "osmosis",
      assets: [
        {
          coinMinimalDenom: atom,
          symbol: "ATOM",
          name: "Cosmos Hub",
          logoURIs: { svg: atomIcon },
        },
        {
          coinMinimalDenom: "uosmo",
          symbol: "changed",
          name: "Osmosis",
          logoURIs: { svg: remoteOsmo },
        },
      ],
    })
  );
  const html = renderToStaticMarkup(
    <EpixMainSwapView
      {...props}
      quote={{
        ...routedQuote,
        routes: quoteRouteView(
          [
            { poolId: "1", tokenOutDenom: atom },
            { poolId: "2", tokenOutDenom: "uosmo" },
          ],
          registry
        ),
      }}
    />
  );
  expect(html).toContain(`src="${atomIcon}"`);
  expect(html).toContain('referrerPolicy="no-referrer"');
  expect(html).toContain(`title="${atom}">ATOM</`);
  expect(html).toContain('src="route-osmo.svg"');
  expect(html).not.toContain(remoteOsmo);
  expect(html).not.toContain("changed");
});

it("shows the bridge and exact quoted pools in order even when fees block the swap", () => {
  const html = renderToStaticMarkup(
    <EpixMainSwapView
      {...props}
      t={(key, values) => [key, ...Object.values(values ?? {})].join(" ")}
      quote={routedQuote}
      canConfirm={false}
      blockReason="Add OSMO before swapping"
    />
  );
  expect(html).toContain("estimated-route");
  expect(html).toContain("route-ibc-bridge");
  expect(html).toContain("route-preview-help");
  expect(html.indexOf("route-pool 2143")).toBeLessThan(
    html.indexOf("route-pool 678")
  );
  expect(html).toContain('title="uosmo">OSMO');
  expect(html).toContain('title="ibc/usdc">USDC');
});

it("shows verified stablecoin icons and symbols while keeping alloyed identities in pool details", () => {
  const html = renderToStaticMarkup(
    <EpixMainSwapView
      {...props}
      quote={{
        ...routedQuote,
        routes: quoteRouteView([
          {
            poolId: "3486",
            tokenOutDenom:
              "factory/osmo1em6xs47hd82806f5cxgyufguxrrc7l0aqx7nzzptjuqgswczk8csavdxek/alloyed/allUSDT",
          },
          {
            poolId: "3507",
            tokenOutDenom:
              "factory/osmo147h5x9pcj7lm0cttlaefx6sqq5vdfnmwfcqxkmjd7exqm9gc7grqhr75m0/alloyed/allUSDC",
          },
        ]),
      }}
    />
  );
  expect(html).toContain('src="route-usdt.svg"');
  expect(html).toContain('src="route-usdc.svg"');
  expect(html).toContain(">USDT</span>");
  expect(html).toContain(">USDC</span>");
  expect(html).toContain("USDT (allUSDT)");
  expect(html).toContain("USDC (allUSDC)");
});

it.each(["loading", "error", "idle"] as const)(
  "hides a stale route when the current quote is %s",
  (quoteState) => {
    const html = renderToStaticMarkup(
      <EpixMainSwapView
        {...props}
        quote={routedQuote}
        quoteState={quoteState}
      />
    );
    expect(html).not.toContain("estimated-route");
    expect(html).not.toContain("route-pool");
    if (quoteState === "loading") {
      expect(html).toContain("estimating");
      expect(html).toContain("route-search-detail");
      expect(html).toContain('role="status" aria-live="polite"');
      expect(html).not.toContain("0.00007 USDC");
    }
  }
);

it("marks an already completed bridge when reviewing only the remaining swap", () => {
  const html = renderToStaticMarkup(
    <EpixMainSwapView
      {...props}
      quote={{ ...routedQuote, bridgeComplete: true }}
    />
  );
  expect(html).toContain("route-ibc-complete");
  expect(html).toContain("route-resume-preview-help");
  expect(html).not.toContain("route-preview-help");
});

it.each(["refreshing", "stale"] as const)(
  "keeps the previous output, route and fee details visible while %s but prevents swapping",
  (quoteState) => {
    const html = renderToStaticMarkup(
      <EpixMainSwapView
        {...props}
        quote={routedQuote}
        quoteState={quoteState}
      />
    );
    expect(html).toContain("0.00007 USDC");
    expect(html).toContain("0.00006 USDC");
    expect(html).toContain("0.03 OSMO");
    expect(html).toContain("estimated-route");
    expect(html).not.toContain("route-search-detail");
    expect(html).toContain(
      quoteState === "refreshing" ? "quote-updating" : "quote-stale"
    );
    expect(html).toContain('<button disabled="">swap</button>');
    if (quoteState === "refreshing")
      expect(html).toContain('<button disabled="">refresh-quote</button>');
  }
);

it.each([
  { osmosisEnabled: false },
  { quote: undefined },
  {
    quote: {
      expectedOutput: "0.00007 USDC",
      minimumOutput: "0.00006 USDC",
      bridgeNetworkFee: "0.003 EPIX",
      osmosisNetworkFeeLimit: undefined,
    },
  },
  { controlsDisabled: true },
  { quoteState: "loading" as const },
  { quoteState: "refreshing" as const },
  { quoteState: "stale" as const },
  { quoteState: "error" as const },
])(
  "blocks the CTA until the adapter has a ready enabled workflow",
  (update) => {
    const html = renderToStaticMarkup(
      <EpixMainSwapView {...props} {...update} />
    );
    expect(html).toContain('<button disabled="">swap</button>');
  }
);

it("reports completed workflow steps without an invented elapsed percentage", () => {
  const html = renderToStaticMarkup(
    <SwapWorkflowProgress
      t={props.t}
      onRefresh={props.onRefresh}
      workflow={{
        id: "test",
        statusText: "Waiting for IBC delivery",
        canResume: true,
        checking: false,
        steps: [
          { id: "deposit", title: "Bridge to Osmosis", state: "complete" },
          { id: "receive", title: "Receive EPIX on Osmosis", state: "active" },
          { id: "swap", title: "Swap on Osmosis", state: "waiting" },
        ],
      }}
    />
  );
  expect(html).toMatch(/<progress[^>]*value="1"[^>]*max="3"/);
  expect(html).toContain('aria-valuetext="Waiting for IBC delivery"');
  expect(html).toContain('aria-current="step"');
  expect(html).not.toContain("<button>resume</button>");
});

it("uses the single primary CTA to resume after a fresh review", () => {
  const workflow = {
    id: "paused",
    statusText: "Ready to resume",
    canResume: true,
    checking: false,
    steps: [],
  };
  const html = renderToStaticMarkup(
    <EpixMainSwapView {...props} workflow={workflow} />
  );
  expect(html.match(/<button>resume<\/button>/g)).toHaveLength(1);
  expect(html).not.toContain("<button>swap</button>");
});

it("locks a paused route's selections without blocking its reviewed resume CTA", () => {
  const workflow = {
    id: "paused",
    statusText: "Ready to resume",
    canResume: true,
    checking: false,
    steps: [],
  };
  const html = renderToStaticMarkup(
    <EpixMainSwapView {...props} workflow={workflow} selectionLocked />
  );
  expect(html).toMatch(/<input[^>]*disabled=""/);
  expect(html.match(/<select[^>]*disabled=""/g)).toHaveLength(3);
  expect(html).toContain("<button>resume</button>");
});

it("shows the bounded approval duration supplied with the quote", () => {
  const html = renderToStaticMarkup(
    <EpixMainSwapView
      {...props}
      t={(key, values) =>
        key === "approval-duration"
          ? `Approval: ${values?.["minutes"]} minutes`
          : key
      }
      quote={{
        expectedOutput: "0.00007 USDC",
        minimumOutput: "0.00006 USDC",
        bridgeNetworkFee: "0.003 EPIX",
        osmosisNetworkFeeLimit: "0.03 OSMO",
        approvalExpiresAt: Date.now() + 10 * 60_000,
      }}
    />
  );
  expect(html).toContain("Approval: 10 minutes");
});

it("leaves read-only recovery refresh available while form controls are disabled", () => {
  const html = renderToStaticMarkup(
    <EpixMainSwapView
      {...props}
      controlsDisabled
      recoveryError="Storage read failed"
      canConfirm={false}
    />
  );
  expect(html).toContain('<button disabled="">swap</button>');
  expect(html).toContain("<button>refresh-quote</button>");
});

it("shows an accessible direction arrow and disables it while an operation owns the selection", () => {
  const html = renderToStaticMarkup(<EpixMainSwapView {...props} />);
  expect(html).toMatch(/<button[^>]*aria-label="reverse-direction"[^>]*>/);
  expect(html).not.toMatch(
    /<button[^>]*aria-label="reverse-direction"[^>]*disabled/
  );
  const locked = renderToStaticMarkup(
    <EpixMainSwapView {...props} selectionLocked />
  );
  expect(locked).toMatch(
    /<button[^>]*aria-label="reverse-direction"[^>]*disabled=""/
  );
});

it("puts the token selector on the paying side and shows EPIX arriving on Epix after flipping", () => {
  const html = renderToStaticMarkup(
    <EpixMainSwapView
      {...props}
      selection={{
        ...props.selection,
        direction: "to-epix",
        inputDenom: "usdc",
        outputDenom: "aepix",
      }}
      destinationAddress="epix-return-account"
      availableBalance="2 USDC"
      quote={{
        expectedOutput: "14,000 EPIX",
        minimumOutput: "13,860 EPIX",
        bridgeNetworkFee: "0.01 OSMO",
        osmosisNetworkFeeLimit: "0.02 OSMO",
      }}
    />
  );
  expect(html).toContain('aria-label="pay-token"');
  expect(html).not.toContain('aria-label="receive-token"');
  expect(html).toContain("receive-on-epix");
  expect(html).toContain("14,000 EPIX");
  expect(html).toContain("epix-return-account");
  expect(html).toContain("osmosis-bridge-fee");
  expect(html).toContain("osmosis-swap-fee");
  expect(html).toContain("reverse-swap-once-help");
  expect(html).not.toContain("epix-network-fee");
  expect(html).not.toContain("receive-on-osmosis");
});
