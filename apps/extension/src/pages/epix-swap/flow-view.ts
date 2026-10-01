import { EpixSwapOperation, EpixSwapReview } from "@keplr-wallet/background";
import { CoinPretty } from "@keplr-wallet/unit";
import { Currency, StdFee } from "@keplr-wallet/types";
import {
  EPIX_CURRENCY,
  EPIX_CHAIN_ID,
  OSMOSIS_CHAIN_ID,
  OSMOSIS_SWAP_TOKENS,
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

function displayFee(fee: StdFee): string | undefined {
  if (fee.amount.length === 0) return displayAmount(EPIX_CURRENCY, "0");
  if (fee.amount.length !== 1) return undefined;
  const coin = fee.amount[0];
  const currency = [EPIX_CURRENCY, ...OSMOSIS_SWAP_TOKENS].find(
    (item) => item.coinMinimalDenom === coin.denom
  );
  return currency ? displayAmount(currency, coin.amount) : undefined;
}

export function quoteView(
  review: EpixSwapReview,
  registry?: ReadonlyMap<string, OsmosisAssetMetadata>
): MainSwapQuoteView | undefined {
  const currency = OSMOSIS_SWAP_TOKENS.find(
    (item) => item.coinMinimalDenom === review.outputDenom
  );
  if (!currency) return undefined;
  const routes = quoteRouteView(review.routes, registry);
  return {
    expectedOutput: displayAmount(currency, review.estimatedAmountOut),
    minimumOutput: displayAmount(currency, review.minimumAmountOut),
    epixNetworkFee: displayFee(review.bridgeFee),
    osmosisNetworkFeeLimit: displayFee(review.swapFeeCap),
    approvalExpiresAt: review.executionExpiresAt,
    ...(routes ? { routes } : {}),
    ...(review.bridgeComplete ? { bridgeComplete: true } : {}),
  };
}

export function workflowView(
  operation: EpixSwapOperation,
  checking: boolean,
  t: TranslateProgress
): MainSwapWorkflowView {
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
