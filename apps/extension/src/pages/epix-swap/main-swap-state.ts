import { EpixSwapOperation, EpixSwapReview } from "@keplr-wallet/background";
import { CoinPretty } from "@keplr-wallet/unit";
import { isRouteFinished } from "./flow-view";
import {
  MainSwapSelection,
  EpixMainSwapViewProps,
  TranslateProgress,
} from "./main-swap-view";
import {
  EPIX_CURRENCY,
  EPIX_CHAIN_ID,
  OSMOSIS_CHAIN_ID,
  OSMOSIS_SWAP_TOKENS,
  OSMOSIS_SWAP_OUTPUT_OPTIONS,
} from "./tokens";
import { parseAmountToMinimal } from "./amount";

export type SwapDraft = {
  direction: MainSwapSelection["direction"];
  tokenIndex: number;
  amount: string;
  slippage: number;
  feeIndex: number;
};

export type SwapQuoteState = {
  key: string;
  review?: EpixSwapReview;
  loading: boolean;
  error?: string;
};
type OwnerMessage = { owner: string; error: string };

export const DEFAULT_SWAP_DRAFT: SwapDraft = {
  amount: "",
  direction: "to-osmosis",
  tokenIndex: 1,
  slippage: 100,
  feeIndex: 3,
};

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
  if (operation) {
    const inputCurrency = swapInputCurrency(operation) ?? EPIX_CURRENCY;
    return {
      direction: operation.direction,
      inputDenom: operation.inputDenom,
      amount: new CoinPretty(inputCurrency, operation.amountIn)
        .toDec()
        .toString(inputCurrency.coinDecimals),
      outputDenom: operation.outputDenom,
      feeDenom: operation.feeDenom,
      slippageBps: operation.slippageBps,
    };
  }
  return {
    direction: draft.direction,
    amount: draft.amount,
    inputDenom:
      draft.direction === "to-epix"
        ? OSMOSIS_SWAP_TOKENS[draft.tokenIndex].coinMinimalDenom
        : EPIX_CURRENCY.coinMinimalDenom,
    outputDenom:
      draft.direction === "to-epix"
        ? EPIX_CURRENCY.coinMinimalDenom
        : OSMOSIS_SWAP_TOKENS[draft.tokenIndex].coinMinimalDenom,
    feeDenom: OSMOSIS_SWAP_TOKENS[draft.feeIndex]?.coinMinimalDenom ?? "uosmo",
    slippageBps: draft.slippage,
  };
}

export function swapInputCurrency(
  selection: Pick<MainSwapSelection, "direction" | "inputDenom">
) {
  if (selection.direction === "to-osmosis")
    return selection.inputDenom === EPIX_CURRENCY.coinMinimalDenom
      ? EPIX_CURRENCY
      : undefined;
  if (
    !OSMOSIS_SWAP_OUTPUT_OPTIONS.some(
      (option) => option.denom === selection.inputDenom
    )
  )
    return undefined;
  return OSMOSIS_SWAP_TOKENS.find(
    (token) => token.coinMinimalDenom === selection.inputDenom
  );
}

export function swapInputAmount(
  selection: MainSwapSelection
): string | undefined {
  const currency = swapInputCurrency(selection);
  const value = selection.amount;
  if (!currency || !value || value === ".") return undefined;
  const withZero = value.startsWith(".") ? `0${value}` : value;
  const normalized = withZero.endsWith(".") ? withZero.slice(0, -1) : withZero;
  try {
    return parseAmountToMinimal(normalized, currency.coinDecimals);
  } catch {
    return undefined;
  }
}

export function flipSwapSelection(
  selection: MainSwapSelection
): MainSwapSelection {
  return {
    ...selection,
    direction: selection.direction === "to-osmosis" ? "to-epix" : "to-osmosis",
    inputDenom: selection.outputDenom,
    outputDenom: selection.inputDenom,
    // A quantity of EPIX must not become the same quantity of BTC or dollars.
    amount: "",
  };
}

export function swapChainIds(direction: MainSwapSelection["direction"]) {
  return direction === "to-epix"
    ? { sourceChainId: OSMOSIS_CHAIN_ID, destinationChainId: EPIX_CHAIN_ID }
    : { sourceChainId: EPIX_CHAIN_ID, destinationChainId: OSMOSIS_CHAIN_ID };
}

export function swapSelectionDraft(selection: MainSwapSelection): SwapDraft {
  const osmosisDenom =
    selection.direction === "to-epix"
      ? selection.inputDenom
      : selection.outputDenom;
  return {
    direction: selection.direction,
    amount: selection.amount,
    slippage: selection.slippageBps,
    tokenIndex: OSMOSIS_SWAP_TOKENS.findIndex(
      (token) => token.coinMinimalDenom === osmosisDenom
    ),
    feeIndex: OSMOSIS_SWAP_TOKENS.findIndex(
      (token) => token.coinMinimalDenom === selection.feeDenom
    ),
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
  operationsError: boolean,
  enabled: OwnerMessage,
  owner: string,
  t: TranslateProgress
): string | undefined {
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
