import { EpixSwapOperation, EpixSwapReview } from "@keplr-wallet/background";
import { CoinPretty } from "@keplr-wallet/unit";
import { Currency, StdFee } from "@keplr-wallet/types";
import {
  EPIX_CURRENCY,
  EPIX_CHAIN_ID,
  OSMOSIS_CHAIN_ID,
  OSMOSIS_SWAP_TOKENS,
  OSMOSIS_SWAP_OUTPUT_OPTIONS,
  OSMOSIS_SWAP_FEE_OPTIONS,
} from "./tokens";
import {
  MainSwapQuoteView,
  MainSwapWorkflowView,
  TranslateProgress,
} from "./main-swap-view";
import { transactionExplorerUrl } from "./explorer";
import { quoteRouteView } from "./quote-route";
import type { OsmosisAssetMetadata } from "./osmosis-asset-registry";

export function isRouteFinished(operation: EpixSwapOperation): boolean {
  return operation.status === "complete" || operation.status === "failed";
}

export function displayAmount(currency: Currency, minimal: string): string {
  return new CoinPretty(currency, minimal)
    .maxDecimals(currency.coinDecimals)
    .trim(true)
    .toString();
}

function displayFee(fee: StdFee, chainId: string): string | undefined {
  const epix = chainId === EPIX_CHAIN_ID;
  if (fee.amount.length === 0)
    return displayAmount(epix ? EPIX_CURRENCY : OSMOSIS_SWAP_TOKENS[3], "0");
  if (fee.amount.length !== 1) return undefined;
  const coin = fee.amount[0];
  const allowed = epix
    ? coin.denom === EPIX_CURRENCY.coinMinimalDenom
    : OSMOSIS_SWAP_FEE_OPTIONS.some((option) => option.denom === coin.denom);
  if (!allowed) return undefined;
  const currency = [EPIX_CURRENCY, ...OSMOSIS_SWAP_TOKENS].find(
    (item) => item.coinMinimalDenom === coin.denom
  );
  return currency ? displayAmount(currency, coin.amount) : undefined;
}

export function quoteView(
  review: EpixSwapReview,
  registry?: ReadonlyMap<string, OsmosisAssetMetadata>
): MainSwapQuoteView | undefined {
  const returning = review.direction === "to-epix";
  const currency = outputCurrency(review);
  if (!currency) return undefined;
  const routeInput = returning
    ? review.inputDenom
    : OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom;
  const routes = review.swapComplete
    ? undefined
    : quoteRouteView(review.routes, registry, routeInput);
  return {
    expectedOutput: displayAmount(currency, review.estimatedAmountOut),
    minimumOutput: displayAmount(currency, review.minimumAmountOut),
    bridgeNetworkFee: displayFee(
      review.bridgeFee,
      returning ? OSMOSIS_CHAIN_ID : EPIX_CHAIN_ID
    ),
    osmosisNetworkFeeLimit: displayFee(review.swapFeeCap, OSMOSIS_CHAIN_ID),
    approvalExpiresAt: review.executionExpiresAt,
    feeShortfall: feeShortfallView(review.feeShortfall),
    ...(routes ? { routes } : {}),
    ...(review.bridgeComplete ? { bridgeComplete: true } : {}),
    ...(review.swapComplete ? { swapComplete: true } : {}),
  };
}

function feeShortfallView(
  funding: EpixSwapReview["feeShortfall"]
): MainSwapQuoteView["feeShortfall"] {
  if (!funding) return undefined;
  const currency = OSMOSIS_SWAP_TOKENS.find(
    (item) => item.coinMinimalDenom === funding.denom
  );
  if (!currency) return undefined;
  return {
    available: displayAmount(currency, funding.available),
    required: displayAmount(currency, funding.required),
    shortfall: displayAmount(currency, funding.shortfall),
    address: funding.address,
  };
}

function outputCurrency(review: EpixSwapReview): Currency | undefined {
  if (review.direction === "to-epix")
    return review.outputDenom === EPIX_CURRENCY.coinMinimalDenom
      ? EPIX_CURRENCY
      : undefined;
  if (
    !OSMOSIS_SWAP_OUTPUT_OPTIONS.some(
      (option) => option.denom === review.outputDenom
    )
  )
    return undefined;
  return OSMOSIS_SWAP_TOKENS.find(
    (item) => item.coinMinimalDenom === review.outputDenom
  );
}

function reverseSteps(
  operation: EpixSwapOperation,
  t: TranslateProgress
): MainSwapWorkflowView["steps"] {
  const complete = operation.status === "complete";
  const failed = operation.status === "failed";
  const swapped = operation.swapConfirmed === true;
  let swapState: "complete" | "active" | "failed" = "active";
  if (swapped) swapState = "complete";
  else if (failed) swapState = "failed";
  let bridgeState: "complete" | "active" | "waiting" | "failed" = "waiting";
  if (operation.depositConfirmed) bridgeState = "complete";
  else if (swapped) bridgeState = failed ? "failed" : "active";
  return [
    {
      id: "swap",
      title: t("route-swap-step"),
      state: swapState,
      explorerUrl: operation.swapTxHash
        ? transactionExplorerUrl(OSMOSIS_CHAIN_ID, operation.swapTxHash)
        : undefined,
    },
    {
      id: "bridge",
      title: t("route-return-bridge-step"),
      state: bridgeState,
      explorerUrl: operation.bridgeTxHash
        ? transactionExplorerUrl(OSMOSIS_CHAIN_ID, operation.bridgeTxHash)
        : undefined,
    },
    {
      id: "received",
      title: t("route-return-receive-step"),
      state: complete ? "complete" : "waiting",
    },
  ];
}

export function workflowView(
  operation: EpixSwapOperation,
  checking: boolean,
  t: TranslateProgress
): MainSwapWorkflowView {
  if (operation.direction === "to-epix") {
    return {
      id: operation.id,
      statusText: t(reverseStatusKey(operation.status)),
      canResume: operation.status === "paused",
      checking,
      error: operation.error,
      steps: reverseSteps(operation, t),
    };
  }
  const complete = operation.status === "complete";
  let bridgeState: "complete" | "failed" | "active" = "active";
  if (operation.depositConfirmed) bridgeState = "complete";
  else if (operation.status === "failed") bridgeState = "failed";
  let swapState: "complete" | "active" | "waiting" | "failed" = "waiting";
  if (complete) swapState = "complete";
  else if (operation.status === "failed" && operation.depositConfirmed)
    swapState = "failed";
  else if (operation.depositConfirmed) swapState = "active";
  return {
    id: operation.id,
    statusText: t(`route-${operation.status}`),
    canResume: operation.status === "paused",
    checking,
    error: operation.error,
    steps: [
      {
        id: "bridge",
        title: t("route-bridge-step"),
        state: bridgeState,
        explorerUrl: operation.bridgeTxHash
          ? transactionExplorerUrl(EPIX_CHAIN_ID, operation.bridgeTxHash)
          : undefined,
      },
      {
        id: "swap",
        title: t("route-swap-step"),
        state: swapState,
        explorerUrl: operation.swapTxHash
          ? transactionExplorerUrl(OSMOSIS_CHAIN_ID, operation.swapTxHash)
          : undefined,
      },
      {
        id: "received",
        title: t("route-receive-step"),
        state: complete ? "complete" : "waiting",
      },
    ],
  };
}

function reverseStatusKey(status: EpixSwapOperation["status"]): string {
  if (status === "complete") return "route-return-complete";
  if (status === "bridging") return "route-returning";
  if (status === "waiting-for-deposit") return "route-waiting-for-return";
  return `route-${status}`;
}
