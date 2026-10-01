import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EpixMainSwapView,
  EpixMainSwapViewProps,
  SwapWorkflowProgress,
} from "./main-swap-view";

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
    amount: "1",
    outputDenom: "usdc",
    slippageBps: 100,
    feeDenom: "uosmo",
  },
  outputOptions: [
    { denom: "usdc", label: "USDC" },
    { denom: "btc", label: "BTC (allBTC)" },
    { denom: "uosmo", label: "OSMO" },
  ],
  feeOptions: [{ denom: "uosmo", label: "OSMO" }],
  availableBalance: "1,000 EPIX",
  osmosisAddress: "osmo-public-test",
  osmosisEnabled: true,
  quoteState: "ready",
  quote: {
    expectedOutput: "0.00007 USDC",
    minimumOutput: "0.00006 USDC",
    epixNetworkFee: "0.003 EPIX",
    osmosisNetworkFeeLimit: "0.03 OSMO",
  },
  restoredDraft: false,
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

it.each([
  { osmosisEnabled: false },
  { quote: undefined },
  {
    quote: {
      expectedOutput: "0.00007 USDC",
      minimumOutput: "0.00006 USDC",
      epixNetworkFee: "0.003 EPIX",
      osmosisNetworkFeeLimit: undefined,
    },
  },
  { controlsDisabled: true },
  { quoteState: "loading" as const },
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
        epixNetworkFee: "0.003 EPIX",
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
