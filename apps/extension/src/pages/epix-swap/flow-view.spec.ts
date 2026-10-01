import type {
  EpixSwapOperation,
  EpixSwapReview,
} from "@keplr-wallet/background";
import {
  displayAmount,
  isRouteFinished,
  quoteView,
  workflowView,
} from "./flow-view";
import { transactionExplorerUrl } from "./explorer";
import { parseOsmosisAssetRegistry } from "./osmosis-asset-registry";
import {
  EPIX_CHAIN_ID,
  EPIX_CURRENCY,
  OSMOSIS_CHAIN_ID,
  OSMOSIS_SWAP_TOKENS,
} from "./tokens";

const review: EpixSwapReview = {
  id: "review",
  expiresAt: 30_000,
  executionExpiresAt: 900_000,
  sourceAddress: "epix-public-address",
  destinationAddress: "osmo-public-address",
  amountIn: "1000000000000000000",
  outputDenom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom,
  estimatedAmountOut: "81",
  minimumAmountOut: "1",
  bridgeFee: { gas: "350000", amount: [{ denom: "aepix", amount: "1" }] },
  swapFeeCap: { gas: "2000000", amount: [{ denom: "uosmo", amount: "72000" }] },
  canStart: true,
};

const operation: EpixSwapOperation = {
  ...review,
  id: "operation",
  vaultId: "vault",
  slippageBps: 100,
  feeDenom: "uosmo",
  sourceRest: "https://api.epix.zone",
  destinationRest: "https://lcd.osmosis.zone",
  status: "waiting-for-deposit",
  createdAt: 0,
  updatedAt: 1,
  depositConfirmed: false,
};

it("preserves tiny output, approved minimum and fee-cap units exactly", () => {
  expect(quoteView(review)).toEqual({
    expectedOutput: "0.000081 USDC",
    minimumOutput: "0.000001 USDC",
    epixNetworkFee: "0.000000000000000001 EPIX",
    osmosisNetworkFeeLimit: "0.072 OSMO",
    approvalExpiresAt: 900_000,
  });
  expect(displayAmount(EPIX_CURRENCY, "1000000000000000001")).toBe(
    "1.000000000000000001 EPIX"
  );
});

it("uses registry metadata only for route display, never outputs, fees or approved amounts", () => {
  const registry = parseOsmosisAssetRegistry(
    JSON.stringify({
      chainName: "osmosis",
      assets: [
        {
          coinMinimalDenom: "unknown",
          symbol: "USDC",
          name: "Unapproved asset",
          decimals: 1,
        },
        {
          coinMinimalDenom: review.outputDenom,
          symbol: "Changed",
          name: "Changed name",
          decimals: 1,
        },
        {
          coinMinimalDenom: "uosmo",
          symbol: "Changed",
          name: "Changed fee",
          decimals: 1,
        },
      ],
    })
  );
  expect(quoteView(review, registry)).toEqual(quoteView(review));
  expect(
    quoteView({ ...review, outputDenom: "unknown" }, registry)
  ).toBeUndefined();
  expect(
    quoteView(
      {
        ...review,
        swapFeeCap: { gas: "1", amount: [{ denom: "unknown", amount: "100" }] },
      },
      registry
    )?.osmosisNetworkFeeLimit
  ).toBeUndefined();
});

it("includes the validated quote path with exact pool IDs and denomination metadata", () => {
  const view = quoteView({
    ...review,
    routes: [
      { poolId: "9007199254740993", tokenOutDenom: "uosmo" },
      { poolId: "3567", tokenOutDenom: review.outputDenom },
    ],
  });
  expect(view?.routes).toEqual([
    {
      poolId: "9007199254740993",
      tokenIn: "EPIX",
      tokenOut: "OSMO",
      tokenInDenom: OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom,
      tokenOutDenom: "uosmo",
    },
    {
      poolId: "3567",
      tokenIn: "OSMO",
      tokenOut: "USDC",
      tokenInDenom: "uosmo",
      tokenOutDenom: review.outputDenom,
    },
  ]);
  expect(view?.minimumOutput).toBe("0.000001 USDC");
});

it("omits route visualization for reviews from a sender that has no route metadata", () => {
  expect(quoteView(review)).not.toHaveProperty("routes");
  expect(quoteView({ ...review, routes: [] })).not.toHaveProperty("routes");
});

it("formats the smallest BTC output and an alternative fee without rounding to zero", () => {
  const btc = OSMOSIS_SWAP_TOKENS[2];
  expect(
    quoteView({
      ...review,
      outputDenom: btc.coinMinimalDenom,
      estimatedAmountOut: "2",
      minimumAmountOut: "1",
      swapFeeCap: {
        gas: "2000000",
        amount: [{ denom: btc.coinMinimalDenom, amount: "1" }],
      },
    })
  ).toMatchObject({
    expectedOutput: "0.00000002 BTC",
    minimumOutput: "0.00000001 BTC",
    osmosisNetworkFeeLimit: "0.00000001 BTC",
  });
});

it("passes confirmed bridge completion to the route preview without inferring it from fees", () => {
  expect(quoteView({ ...review, bridgeComplete: true })?.bridgeComplete).toBe(
    true
  );
  expect(
    quoteView({ ...review, bridgeFee: { gas: "0", amount: [] } })
      ?.bridgeComplete
  ).toBeUndefined();
});

it("does not invent a display value for unsupported output or fee denominations", () => {
  expect(quoteView({ ...review, outputDenom: "unknown" })).toBeUndefined();
  expect(
    quoteView({
      ...review,
      swapFeeCap: {
        gas: "2000000",
        amount: [{ denom: "unknown", amount: "100" }],
      },
    })?.osmosisNetworkFeeLimit
  ).toBeUndefined();
  expect(
    quoteView({
      ...review,
      swapFeeCap: {
        gas: "2000000",
        amount: [
          { denom: "uosmo", amount: "1" },
          { denom: review.outputDenom, amount: "1" },
        ],
      },
    })?.osmosisNetworkFeeLimit
  ).toBeUndefined();
});

it.each<{
  status: EpixSwapOperation["status"];
  depositConfirmed: boolean;
  states: string[];
  canResume: boolean;
  finished: boolean;
}>([
  {
    status: "bridging",
    depositConfirmed: false,
    states: ["active", "waiting", "waiting"],
    canResume: false,
    finished: false,
  },
  {
    status: "waiting-for-deposit",
    depositConfirmed: false,
    states: ["active", "waiting", "waiting"],
    canResume: false,
    finished: false,
  },
  {
    status: "swapping",
    depositConfirmed: true,
    states: ["complete", "active", "waiting"],
    canResume: false,
    finished: false,
  },
  {
    status: "paused",
    depositConfirmed: false,
    states: ["active", "waiting", "waiting"],
    canResume: true,
    finished: false,
  },
  {
    status: "paused",
    depositConfirmed: true,
    states: ["complete", "active", "waiting"],
    canResume: true,
    finished: false,
  },
  {
    status: "failed",
    depositConfirmed: false,
    states: ["failed", "waiting", "waiting"],
    canResume: false,
    finished: true,
  },
  {
    status: "failed",
    depositConfirmed: true,
    states: ["complete", "failed", "waiting"],
    canResume: false,
    finished: true,
  },
  {
    status: "complete",
    depositConfirmed: true,
    states: ["complete", "complete", "complete"],
    canResume: false,
    finished: true,
  },
])(
  "shows $status progress with deposit receipt=$depositConfirmed",
  ({ status, depositConfirmed, states, canResume, finished }) => {
    const current = { ...operation, status, depositConfirmed };
    const view = workflowView(current, false, (key) => key);
    expect(view.steps.map((step) => step.id)).toEqual([
      "bridge",
      "swap",
      "received",
    ]);
    expect(view.steps.map((step) => step.state)).toEqual(states);
    expect(view.statusText).toBe(`route-${status}`);
    expect(view.canResume).toBe(canResume);
    expect(isRouteFinished(current)).toBe(finished);
  }
);

it("keeps recovery feedback and chain-specific transaction links visible", () => {
  const hash = "ab".repeat(32);
  const view = workflowView(
    {
      ...operation,
      status: "paused",
      bridgeTxHash: hash,
      swapTxHash: hash,
      error: "Check transaction status before resuming",
    },
    true,
    (key) => key
  );
  expect(view).toMatchObject({
    id: "operation",
    checking: true,
    error: "Check transaction status before resuming",
    canResume: true,
  });
  expect(view.steps[0].explorerUrl).toBe(
    `https://explorer.epix.zone/?tx=${hash.toUpperCase()}`
  );
  expect(view.steps[1].explorerUrl).toBe(
    `https://www.mintscan.io/osmosis/transactions/${hash.toUpperCase()}`
  );
});

it.each([
  "a".repeat(63),
  "a".repeat(65),
  "g".repeat(64),
  `${"a".repeat(63)}\n`,
  `0x${"a".repeat(62)}`,
  "../".repeat(21) + "a",
  "",
])("rejects explorer hash %p instead of creating a link", (hash) => {
  expect(transactionExplorerUrl(EPIX_CHAIN_ID, hash)).toBeUndefined();
  expect(transactionExplorerUrl(OSMOSIS_CHAIN_ID, hash)).toBeUndefined();
  const view = workflowView(
    { ...operation, bridgeTxHash: hash, swapTxHash: hash },
    false,
    (key) => key
  );
  expect(view.steps[0].explorerUrl).toBeUndefined();
  expect(view.steps[1].explorerUrl).toBeUndefined();
});

it("rejects an unsupported explorer chain even with a valid transaction hash", () => {
  expect(transactionExplorerUrl("unknown-1", "F".repeat(64))).toBeUndefined();
});
