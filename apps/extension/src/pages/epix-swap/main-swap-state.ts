import { EpixSwapOperation, EpixSwapReview } from "@keplr-wallet/background";
import { CoinPretty } from "@keplr-wallet/unit";
import { SwapDraft } from "./draft";
import { isRouteFinished } from "./flow-view";
import {
  MainSwapSelection,
  EpixMainSwapViewProps,
  TranslateProgress,
} from "./main-swap-view";
import { EPIX_CURRENCY, OSMOSIS_SWAP_TOKENS } from "./tokens";

export type SwapQuoteState = {
  key: string;
  review?: EpixSwapReview;
  loading: boolean;
  error?: string;
};
type OwnerMessage = { owner: string; error: string };

export function currentOperation(operations: EpixSwapOperation[]) {
  const ordered = [...operations].sort((a, b) => b.createdAt - a.createdAt);
  const operation =
    ordered.find((item) => !isRouteFinished(item)) ?? ordered[0];
  const unfinished =
    operation && !isRouteFinished(operation) ? operation : undefined;
  return {
    operation,
    unfinished,
    resumeId: unfinished?.status === "paused" ? unfinished.id : undefined,
  };
}

export function swapSelection(
  draft: SwapDraft,
  operation?: EpixSwapOperation
): MainSwapSelection {
  if (operation)
    return {
      amount: new CoinPretty(EPIX_CURRENCY, operation.amountIn)
        .toDec()
        .toString(),
      outputDenom: operation.outputDenom,
      feeDenom: operation.feeDenom,
      slippageBps: operation.slippageBps,
    };
  return {
    amount: draft.amount,
    outputDenom:
      OSMOSIS_SWAP_TOKENS[draft.outputIndex]?.coinMinimalDenom ??
      OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom,
    feeDenom: OSMOSIS_SWAP_TOKENS[draft.feeIndex]?.coinMinimalDenom ?? "uosmo",
    slippageBps: draft.slippage,
  };
}

export function boundAccountReview(
  quote: SwapQuoteState,
  key: string,
  ready: boolean,
  sourceAddress: string,
  destinationAddress: string
): EpixSwapReview | undefined {
  if (
    !ready ||
    quote.key !== key ||
    quote.review?.sourceAddress !== sourceAddress ||
    quote.review?.destinationAddress !== destinationAddress
  )
    return undefined;
  return quote.review;
}

export function beginQuoteRefresh(
  previous: SwapQuoteState,
  key: string,
  ready: boolean
): SwapQuoteState {
  if (!ready || previous.key !== key) return { key, loading: ready };
  return { ...previous, loading: true };
}

export function failQuoteRefresh(
  previous: SwapQuoteState,
  key: string,
  error: string
): SwapQuoteState {
  return {
    key,
    review: previous.key === key ? previous.review : undefined,
    loading: false,
    error,
  };
}

export function isQuoteConfirmable(
  quote: SwapQuoteState,
  key: string,
  review: EpixSwapReview | undefined,
  ready: boolean,
  now: number
): boolean {
  return (
    ready &&
    quote.key === key &&
    !!review?.canStart &&
    quote.review?.id === review.id &&
    !quote.loading &&
    !quote.error &&
    now < review.expiresAt
  );
}

export function quoteDisplayState(
  quote: SwapQuoteState,
  key: string,
  review?: EpixSwapReview
): EpixMainSwapViewProps["quoteState"] {
  if (quote.key !== key) return "idle";
  if (quote.loading) return review ? "refreshing" : "loading";
  if (quote.error) return review ? "stale" : "error";
  if (review) return "ready";
  return "idle";
}

export function recoveryMessage(
  draftError: boolean,
  operationsError: boolean,
  enabled: OwnerMessage,
  owner: string,
  t: TranslateProgress
): string | undefined {
  if (draftError) return t("storage-unavailable");
  if (operationsError) return t("tracking-unavailable");
  if (enabled.owner === owner && enabled.error) return enabled.error;
  return undefined;
}

export function quoteMessage(
  quote: SwapQuoteState,
  key: string,
  confirmation: OwnerMessage,
  owner: string
): string | undefined {
  if (confirmation.owner === owner && confirmation.error)
    return confirmation.error;
  return quote.key === key ? quote.error : undefined;
}
