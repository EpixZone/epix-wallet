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
  direction: "to-osmosis",
  inputDenom: "aepix",
  sourceChainId: EPIX_CHAIN_ID,
  destinationChainId: OSMOSIS_CHAIN_ID,
  expiresAt: 30_000,
  executionExpiresAt: 900_000,
  sourceAddress: "epix-public-address",
  destinationAddress: "osmo-public-address",
  amountIn: "1000000000000000000",
  outputDenom: OSMOSIS_SWAP_TOKENS[4].coinMinimalDenom,
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

const reverseReview: EpixSwapReview = {
  ...review,
  direction: "to-epix",
  inputDenom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom,
  outputDenom: EPIX_CURRENCY.coinMinimalDenom,
  sourceChainId: OSMOSIS_CHAIN_ID,
  destinationChainId: EPIX_CHAIN_ID,
  sourceAddress: review.destinationAddress,
  destinationAddress: review.sourceAddress,
  amountIn: "1000000",
  estimatedAmountOut: "1000000000000000001",
  minimumAmountOut: "999999999999999999",
  bridgeFee: {
    gas: "200000",
    amount: [{ denom: OSMOSIS_SWAP_TOKENS[5].coinMinimalDenom, amount: "1" }],
  },
  routes: [
    { poolId: "3486", tokenOutDenom: OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom },
  ],
};

it("shows reverse output in exact native Epix units and bridge fees in the actual Osmosis fee token", () => {
  const view = quoteView(reverseReview);
  expect(view).toMatchObject({
    expectedOutput: "1.000000000000000001 EPIX",
    minimumOutput: "0.999999999999999999 EPIX",
    bridgeNetworkFee: "0.000001 USDC",
    osmosisNetworkFeeLimit: "0.072 OSMO",
  });
  expect(view?.routes?.[0]).toMatchObject({
    tokenIn: "USDT (allUSDT)",
    tokenInDenom: reverseReview.inputDenom,
    tokenOut: "EPIX",
    tokenOutDenom: OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom,
  });
  expect(
    quoteView({
      ...reverseReview,
      outputDenom: OSMOSIS_SWAP_TOKENS[6].coinMinimalDenom,
    })
  ).toBeUndefined();
  expect(
    quoteView({ ...reverseReview, bridgeFee: review.bridgeFee })
      ?.bridgeNetworkFee
  ).toBeUndefined();
  expect(
    quoteView({ ...review, bridgeFee: reverseReview.bridgeFee })
      ?.bridgeNetworkFee
  ).toBeUndefined();
});

it("shows only the remaining bridge after a verified reverse swap without repeating old pools", () => {
  const view = quoteView({
    ...reverseReview,
    swapComplete: true,
    swapAmountOut: "1000000000000000001",
    swapFeeCap: { gas: "0", amount: [] },
  });
  expect(view).toMatchObject({
    swapComplete: true,
    expectedOutput: "1.000000000000000001 EPIX",
    minimumOutput: "0.999999999999999999 EPIX",
    bridgeNetworkFee: "0.000001 USDC",
    osmosisNetworkFeeLimit: "0 OSMO",
  });
  expect(view).not.toHaveProperty("routes");
  expect(view).not.toHaveProperty("bridgeComplete");
});

it("preserves tiny output, approved minimum and fee-cap units exactly", () => {
  expect(quoteView(review)).toEqual({
    expectedOutput: "0.000081 USDC",
    minimumOutput: "0.000001 USDC",
    bridgeNetworkFee: "0.000000000000000001 EPIX",
    osmosisNetworkFeeLimit: "0.072 OSMO",
    approvalExpiresAt: 900_000,
  });
  expect(displayAmount(EPIX_CURRENCY, "1000000000000000001")).toBe(
    "1.000000000000000001 EPIX"
  );
});

it.each([1, 4])(
  "formats alloyed stablecoin output %s with exact six-decimal units",
  (index) => {
    const token = OSMOSIS_SWAP_TOKENS[index];
    const view = quoteView({ ...review, outputDenom: token.coinMinimalDenom });
    expect(view?.expectedOutput).toBe(`0.000081 ${token.coinDenom}`);
    expect(view?.minimumOutput).toBe(`0.000001 ${token.coinDenom}`);
    expect(view?.osmosisNetworkFeeLimit).toBe("0.072 OSMO");
    expect(
      quoteView({
        ...review,
        swapFeeCap: {
          gas: "2000000",
          amount: [{ denom: token.coinMinimalDenom, amount: "1" }],
        },
      })?.osmosisNetworkFeeLimit
    ).toBeUndefined();
  }
);

it("does not offer native USDC as an output while retaining its separate fee units", () => {
  const native = OSMOSIS_SWAP_TOKENS[5].coinMinimalDenom;
  expect(quoteView({ ...review, outputDenom: native })).toBeUndefined();
  expect(
    quoteView({
      ...review,
      swapFeeCap: { gas: "2000000", amount: [{ denom: native, amount: "1" }] },
    })?.osmosisNetworkFeeLimit
  ).toBe("0.000001 USDC");
});

it.each([
  {
    token: 3,
    available: "0",
    required: "72000",
    shortfall: "72000",
    displayed: ["0 OSMO", "0.072 OSMO", "0.072 OSMO"],
  },
  {
    token: 5,
    available: "17",
    required: "29",
    shortfall: "12",
    displayed: ["0.000017 USDC", "0.000029 USDC", "0.000012 USDC"],
  },
  {
    token: 2,
    available: "9007199254740993",
    required: "9007199254740994",
    shortfall: "1",
    displayed: [
      "90,071,992.54740993 BTC",
      "90,071,992.54740994 BTC",
      "0.00000001 BTC",
    ],
  },
])(
  "formats fee funding for token $token without losing minimal units or zero balances",
  ({ token, available, required, shortfall, displayed }) => {
    const funding = quoteView({
      ...review,
      canStart: false,
      feeShortfall: {
        denom: OSMOSIS_SWAP_TOKENS[token].coinMinimalDenom,
        available,
        required,
        shortfall,
        address: review.destinationAddress,
      },
    })?.feeShortfall;
    expect(funding).toEqual({
      available: displayed[0],
      required: displayed[1],
      shortfall: displayed[2],
      address: review.destinationAddress,
    });
  }
);

it("preserves the reserved-input fee balance and actual Osmosis address for a reverse swap", () => {
  const funding = quoteView({
    ...reverseReview,
    inputDenom: "uosmo",
    amountIn: "1000000",
    canStart: false,
    feeShortfall: {
      denom: "uosmo",
      available: "4321",
      required: "84600",
      shortfall: "80279",
      address: reverseReview.sourceAddress,
    },
  })?.feeShortfall;
  expect(funding).toEqual({
    available: "0.004321 OSMO",
    required: "0.0846 OSMO",
    shortfall: "0.080279 OSMO",
    address: "osmo-public-address",
  });
});

it("does not invent fee-funding units for an unknown denomination", () => {
  expect(
    quoteView({
      ...review,
      feeShortfall: {
        denom: "factory/unknown/usdc",
        available: "0",
        required: "1",
        shortfall: "1",
        address: review.destinationAddress,
      },
    })?.feeShortfall
  ).toBeUndefined();
  expect(quoteView(review)?.feeShortfall).toBeUndefined();
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
      tokenOut: "USDC (allUSDC)",
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

it.each<{
  status: EpixSwapOperation["status"];
  swapConfirmed: boolean;
  depositConfirmed: boolean;
  states: string[];
  statusKey: string;
}>([
  {
    status: "swapping",
    swapConfirmed: false,
    depositConfirmed: false,
    states: ["active", "waiting", "waiting"],
    statusKey: "route-swapping",
  },
  {
    status: "bridging",
    swapConfirmed: true,
    depositConfirmed: false,
    states: ["complete", "active", "waiting"],
    statusKey: "route-returning",
  },
  {
    status: "waiting-for-deposit",
    swapConfirmed: true,
    depositConfirmed: false,
    states: ["complete", "active", "waiting"],
    statusKey: "route-waiting-for-return",
  },
  {
    status: "paused",
    swapConfirmed: false,
    depositConfirmed: false,
    states: ["active", "waiting", "waiting"],
    statusKey: "route-paused",
  },
  {
    status: "paused",
    swapConfirmed: true,
    depositConfirmed: false,
    states: ["complete", "active", "waiting"],
    statusKey: "route-paused",
  },
  {
    status: "failed",
    swapConfirmed: false,
    depositConfirmed: false,
    states: ["failed", "waiting", "waiting"],
    statusKey: "route-failed",
  },
  {
    status: "failed",
    swapConfirmed: true,
    depositConfirmed: false,
    states: ["complete", "failed", "waiting"],
    statusKey: "route-failed",
  },
  {
    status: "complete",
    swapConfirmed: true,
    depositConfirmed: true,
    states: ["complete", "complete", "complete"],
    statusKey: "route-return-complete",
  },
])(
  "orders reverse $status progress after swap receipt=$swapConfirmed",
  ({ status, swapConfirmed, depositConfirmed, states, statusKey }) => {
    const current: EpixSwapOperation = {
      ...operation,
      ...reverseReview,
      status,
      swapConfirmed,
      depositConfirmed,
      bridgeTxHash: "a".repeat(64),
      swapTxHash: "b".repeat(64),
    };
    const view = workflowView(current, false, (key) => key);
    expect(view.steps.map((step) => step.id)).toEqual([
      "swap",
      "bridge",
      "received",
    ]);
    expect(view.steps.map((step) => step.state)).toEqual(states);
    expect(view.statusText).toBe(statusKey);
    expect(view.canResume).toBe(status === "paused");
    expect(view.steps[1].title).toBe("route-return-bridge-step");
    expect(view.steps[2].title).toBe("route-return-receive-step");
    expect(view.steps[0].explorerUrl).toBe(
      transactionExplorerUrl(OSMOSIS_CHAIN_ID, "b".repeat(64))
    );
    expect(view.steps[1].explorerUrl).toBe(
      transactionExplorerUrl(OSMOSIS_CHAIN_ID, "a".repeat(64))
    );
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
