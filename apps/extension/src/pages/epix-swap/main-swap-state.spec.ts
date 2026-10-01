import { EpixSwapOperation, EpixSwapReview } from "@keplr-wallet/background";
import { SwapDraft } from "./draft";
import {
  boundAccountReview,
  currentOperation,
  quoteDisplayState,
  quoteMessage,
  recoveryMessage,
  swapSelection,
  SwapQuoteState,
} from "./main-swap-state";
import { OSMOSIS_SWAP_TOKENS } from "./tokens";

const review: EpixSwapReview = {
  id: "review-a",
  expiresAt: 30_000,
  executionExpiresAt: 900_000,
  sourceAddress: "epix-account-a",
  destinationAddress: "osmosis-account-a",
  amountIn: "1000000000000000000",
  outputDenom: "uosmo",
  estimatedAmountOut: "2000",
  minimumAmountOut: "1980",
  bridgeFee: { amount: [{ denom: "aepix", amount: "1" }], gas: "100000" },
  swapFeeCap: { amount: [{ denom: "uosmo", amount: "1" }], gas: "100000" },
  canStart: true,
};
const quote: SwapQuoteState = {
  key: "wallet-a-request-1",
  review,
  loading: false,
};
const draft: SwapDraft = {
  amount: "2",
  outputIndex: 1,
  feeIndex: 3,
  slippage: 100,
};

function operation(
  changes: Partial<EpixSwapOperation> = {}
): EpixSwapOperation {
  return {
    id: "pending-a",
    vaultId: "wallet-a",
    sourceAddress: review.sourceAddress,
    destinationAddress: review.destinationAddress,
    amountIn: "123456789012345678901234567891",
    outputDenom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom,
    minimumAmountOut: "1980",
    estimatedAmountOut: "2000",
    slippageBps: 50,
    feeDenom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom,
    bridgeFee: review.bridgeFee,
    swapFeeCap: review.swapFeeCap,
    sourceRest: "https://source.example",
    destinationRest: "https://destination.example",
    status: "paused",
    createdAt: 1,
    updatedAt: 1,
    expiresAt: 2,
    depositConfirmed: false,
    ...changes,
  };
}

test.each([
  [
    "stale request key",
    "wallet-a-request-2",
    true,
    review.sourceAddress,
    review.destinationAddress,
  ],
  [
    "source account changed",
    quote.key,
    true,
    "epix-account-b",
    review.destinationAddress,
  ],
  [
    "destination account changed",
    quote.key,
    true,
    review.sourceAddress,
    "osmosis-account-b",
  ],
  [
    "account is still loading",
    quote.key,
    false,
    review.sourceAddress,
    review.destinationAddress,
  ],
] as const)(
  "hides the review when %s",
  (_reason, key, ready, source, destination) => {
    const bound = boundAccountReview(quote, key, ready, source, destination);
    expect(bound).toBeUndefined();
    expect(quoteDisplayState(quote, key, bound)).toBe("idle");
  }
);

test("shows the completed quote only for its ready source and destination accounts", () => {
  const bound = boundAccountReview(
    quote,
    quote.key,
    true,
    review.sourceAddress,
    review.destinationAddress
  );
  expect(bound).toBe(review);
  expect(quoteDisplayState(quote, quote.key, bound)).toBe("ready");
  expect(quoteDisplayState({ key: quote.key, loading: true }, quote.key)).toBe(
    "loading"
  );
});

test("never shows another owner's quote error, confirmation error, or loading state", () => {
  const oldQuote = { ...quote, error: "Old quote error", loading: true };
  const oldConfirmation = { owner: "wallet-a", error: "Old submission error" };
  expect(
    quoteMessage(oldQuote, "wallet-b-request", oldConfirmation, "wallet-b")
  ).toBeUndefined();
  expect(quoteDisplayState(oldQuote, "wallet-b-request")).toBe("idle");
  expect(
    recoveryMessage(false, false, oldConfirmation, "wallet-b", (key) => key)
  ).toBeUndefined();
});

test("shows current quote failures and prefers the current submission failure", () => {
  const failedQuote = {
    ...quote,
    review: undefined,
    error: "Quote unavailable",
  };
  expect(quoteDisplayState(failedQuote, quote.key)).toBe("error");
  expect(
    quoteMessage(
      failedQuote,
      quote.key,
      { owner: "wallet-a", error: "" },
      "wallet-a"
    )
  ).toBe("Quote unavailable");
  expect(
    quoteMessage(
      failedQuote,
      quote.key,
      { owner: "wallet-a", error: "Submission needs attention" },
      "wallet-a"
    )
  ).toBe("Submission needs attention");
});

test("an older unfinished recovery takes precedence over newer completed history without mutating the list", () => {
  const pending = operation();
  const completed = operation({
    id: "completed",
    status: "complete",
    createdAt: 3,
  });
  const failed = operation({ id: "failed", status: "failed", createdAt: 2 });
  const history = [pending, completed, failed];
  const result = currentOperation(history);
  expect(result).toEqual({
    operation: pending,
    unfinished: pending,
    resumeId: pending.id,
  });
  expect(history).toEqual([pending, completed, failed]);
  expect(swapSelection(draft, result.unfinished)).toEqual({
    amount: "123456789012.345678901234567891",
    outputDenom: pending.outputDenom,
    feeDenom: pending.feeDenom,
    slippageBps: 50,
  });
});

test("a running operation remains selected but never offers another resume", () => {
  const running = operation({ status: "waiting-for-deposit" });
  expect(currentOperation([running])).toEqual({
    operation: running,
    unfinished: running,
    resumeId: undefined,
  });
});

test("completed history permits a new swap using the saved form rather than old approved inputs", () => {
  const older = operation({ status: "failed", createdAt: 1 });
  const newer = operation({ id: "newer", status: "complete", createdAt: 2 });
  const result = currentOperation([older, newer]);
  expect(result).toEqual({
    operation: newer,
    unfinished: undefined,
    resumeId: undefined,
  });
  expect(swapSelection(draft, result.unfinished)).toEqual({
    amount: "2",
    outputDenom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom,
    feeDenom: "uosmo",
    slippageBps: 100,
  });
});
