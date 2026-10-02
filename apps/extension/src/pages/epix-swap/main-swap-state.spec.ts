import { EpixSwapOperation, EpixSwapReview } from "@keplr-wallet/background";
import {
  boundAccountReview,
  beginQuoteRefresh,
  currentOperation,
  failQuoteRefresh,
  isQuoteConfirmable,
  quoteDisplayState,
  quoteMessage,
  recoveryMessage,
  swapSelection,
  swapSelectionDraft,
  swapChainIds,
  flipSwapSelection,
  swapInputAmount,
  SwapQuoteState,
  DEFAULT_SWAP_DRAFT,
  SwapDraft,
} from "./main-swap-state";
import {
  OSMOSIS_SWAP_TOKENS,
  OSMOSIS_SWAP_OUTPUT_OPTIONS,
  OSMOSIS_SWAP_FEE_OPTIONS,
} from "./tokens";

const review: EpixSwapReview = {
  direction: "to-osmosis",
  inputDenom: "aepix",
  sourceChainId: "epix_1916-1",
  destinationChainId: "osmosis-1",
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
  direction: "to-osmosis",
  amount: "2",
  tokenIndex: 1,
  feeIndex: 3,
  slippage: 100,
};

test("offers exactly the four requested outputs and defaults new forms to alloyed USDT", () => {
  expect(OSMOSIS_SWAP_OUTPUT_OPTIONS.map((option) => option.label)).toEqual([
    "BTC (allBTC)",
    "USDT (allUSDT)",
    "USDC (allUSDC)",
    "OSMO",
  ]);
  const initial = swapSelection(DEFAULT_SWAP_DRAFT);
  expect(initial).toEqual({
    direction: "to-osmosis",
    inputDenom: "aepix",
    amount: "",
    outputDenom:
      "factory/osmo1em6xs47hd82806f5cxgyufguxrrc7l0aqx7nzzptjuqgswczk8csavdxek/alloyed/allUSDT",
    feeDenom: "uosmo",
    slippageBps: 100,
  });
  expect(
    OSMOSIS_SWAP_OUTPUT_OPTIONS.map((option) => option.denom)
  ).not.toContain(OSMOSIS_SWAP_TOKENS[5].coinMinimalDenom);
  expect(OSMOSIS_SWAP_FEE_OPTIONS.map((option) => option.denom)).toEqual([
    "uosmo",
    OSMOSIS_SWAP_TOKENS[5].coinMinimalDenom,
    OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom,
  ]);
});

function operation(
  changes: Partial<EpixSwapOperation> = {}
): EpixSwapOperation {
  return {
    direction: "to-osmosis",
    inputDenom: "aepix",
    sourceChainId: "epix_1916-1",
    destinationChainId: "osmosis-1",
    id: "pending-a",
    vaultId: "wallet-a",
    sourceAddress: review.sourceAddress,
    destinationAddress: review.destinationAddress,
    amountIn: "123456789012345678901234567891",
    outputDenom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom,
    minimumAmountOut: "1980",
    estimatedAmountOut: "2000",
    slippageBps: 50,
    feeDenom: OSMOSIS_SWAP_TOKENS[5].coinMinimalDenom,
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

test("keeps the same selection's route, fees, and block reason through refresh and failure", () => {
  const blockedReview = {
    ...review,
    canStart: false,
    blockReason: "Add a supported fee token",
    routes: [{ poolId: "3351", tokenOutDenom: "uosmo" }],
  };
  const initial = { ...quote, review: blockedReview };
  const refreshing = beginQuoteRefresh(initial, quote.key, true);
  expect(refreshing.review).toBe(blockedReview);
  expect(quoteDisplayState(refreshing, quote.key, blockedReview)).toBe(
    "refreshing"
  );

  const failed = failQuoteRefresh(refreshing, quote.key, "Network unavailable");
  expect(failed.review).toBe(blockedReview);
  expect(quoteDisplayState(failed, quote.key, blockedReview)).toBe("stale");

  const retrying = beginQuoteRefresh(failed, quote.key, true);
  expect(retrying.review).toBe(blockedReview);
  expect(retrying.error).toBe("Network unavailable");
  expect(quoteDisplayState(retrying, quote.key, blockedReview)).toBe(
    "refreshing"
  );
  expect(
    quoteMessage(
      retrying,
      quote.key,
      { owner: "wallet-a", error: "" },
      "wallet-a"
    )
  ).toBe("Network unavailable");

  const replacement = { ...review, id: "review-b", minimumAmountOut: "2000" };
  const completed = { key: quote.key, review: replacement, loading: false };
  expect(quoteDisplayState(completed, quote.key, replacement)).toBe("ready");
  expect(
    quoteMessage(
      completed,
      quote.key,
      { owner: "wallet-a", error: "" },
      "wallet-a"
    )
  ).toBeUndefined();
});

test.each([
  ["vault", "wallet-b", "epix-a", "osmosis-a", "1000000000000000000", "uosmo"],
  [
    "source address",
    "wallet-a",
    "epix-b",
    "osmosis-a",
    "1000000000000000000",
    "uosmo",
  ],
  [
    "destination address",
    "wallet-a",
    "epix-a",
    "osmosis-b",
    "1000000000000000000",
    "uosmo",
  ],
  ["amount", "wallet-a", "epix-a", "osmosis-a", "2000000000000000000", "uosmo"],
  [
    "output token",
    "wallet-a",
    "epix-a",
    "osmosis-a",
    "1000000000000000000",
    "usdc",
  ],
])(
  "discards cached review and error when the %s request changes",
  (_name, ...values) => {
    const key = JSON.stringify([
      "wallet-a",
      "epix-a",
      "osmosis-a",
      "1000000000000000000",
      "uosmo",
    ]);
    const nextKey = JSON.stringify(values);
    const previous = { ...quote, key, error: "Previous selection failed" };
    const next = beginQuoteRefresh(previous, nextKey, true);
    expect(next).toEqual({ key: nextKey, loading: true });
    expect(quoteDisplayState(next, nextKey)).toBe("loading");
    expect(failQuoteRefresh(previous, nextKey, "New failure")).toEqual({
      key: nextKey,
      review: undefined,
      loading: false,
      error: "New failure",
    });
  }
);

test("clears the cached quote when locking or preparation becomes unavailable", () => {
  const failed = failQuoteRefresh(quote, quote.key, "Offline");
  const stopped = beginQuoteRefresh(failed, quote.key, false);
  expect(stopped).toEqual({ key: quote.key, loading: false });
  expect(beginQuoteRefresh(stopped, quote.key, true).review).toBeUndefined();
  expect(
    boundAccountReview(
      failed,
      quote.key,
      false,
      review.sourceAddress,
      review.destinationAddress
    )
  ).toBeUndefined();
});

test("refreshing and failed retained estimates never authorize a swap", () => {
  expect(isQuoteConfirmable(quote, quote.key, review, true, 1)).toBe(true);
  const refreshing = beginQuoteRefresh(quote, quote.key, true);
  expect(isQuoteConfirmable(refreshing, quote.key, review, true, 1)).toBe(
    false
  );
  const failed = failQuoteRefresh(refreshing, quote.key, "Offline");
  expect(isQuoteConfirmable(failed, quote.key, review, true, 1)).toBe(false);
  expect(
    isQuoteConfirmable(
      beginQuoteRefresh(failed, quote.key, true),
      quote.key,
      review,
      true,
      1
    )
  ).toBe(false);
});

test("approval revalidation rejects a replacement, expiry, account change, or unavailable preparation", () => {
  const replacement = { ...quote, review: { ...review, id: "review-b" } };
  expect(isQuoteConfirmable(replacement, quote.key, review, true, 1)).toBe(
    false
  );
  expect(
    isQuoteConfirmable(quote, quote.key, review, true, review.expiresAt)
  ).toBe(false);
  expect(isQuoteConfirmable(quote, "new-owner", review, true, 1)).toBe(false);
  expect(isQuoteConfirmable(quote, quote.key, review, false, 1)).toBe(false);
  const mismatchedAccount = boundAccountReview(
    quote,
    quote.key,
    true,
    "different-source-address",
    review.destinationAddress
  );
  expect(isQuoteConfirmable(quote, quote.key, mismatchedAccount, true, 1)).toBe(
    false
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
    recoveryMessage(false, oldConfirmation, "wallet-b", (key) => key)
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
    direction: "to-osmosis",
    inputDenom: "aepix",
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

test("completed history permits a new swap using the current form rather than old approved inputs", () => {
  const older = operation({ status: "failed", createdAt: 1 });
  const newer = operation({ id: "newer", status: "complete", createdAt: 2 });
  const result = currentOperation([older, newer]);
  expect(result).toEqual({
    operation: newer,
    unfinished: undefined,
    resumeId: undefined,
  });
  expect(swapSelection(draft, result.unfinished)).toEqual({
    direction: "to-osmosis",
    inputDenom: "aepix",
    amount: "2",
    outputDenom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom,
    feeDenom: "uosmo",
    slippageBps: 100,
  });
});

test("flipping preserves the chosen Osmosis asset and clears the quantity in both directions", () => {
  const forward = swapSelection({ ...draft, tokenIndex: 2 });
  const reverse = flipSwapSelection(forward);
  expect(reverse).toEqual({
    ...forward,
    direction: "to-epix",
    inputDenom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom,
    outputDenom: "aepix",
    amount: "",
  });
  expect(flipSwapSelection({ ...reverse, amount: "0.01" })).toEqual({
    ...forward,
    amount: "",
  });
});

test.each([
  [1, "1.234567", "1234567"],
  [4, ".123456", "123456"],
  [2, "0.12345678", "12345678"],
  [3, "1.", "1000000"],
] as const)(
  "uses the exact input decimals for reverse token index %i",
  (tokenIndex, amount, minimal) => {
    const selection = swapSelection({
      ...draft,
      direction: "to-epix",
      tokenIndex,
      amount,
    });
    expect(selection.outputDenom).toBe("aepix");
    expect(swapInputAmount(selection)).toBe(minimal);
    expect(
      swapInputAmount({ ...selection, amount: "0.000000001" })
    ).toBeUndefined();
  }
);

test("a paused reverse route restores its original input using stablecoin precision", () => {
  const pending = operation({
    direction: "to-epix",
    inputDenom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom,
    outputDenom: "aepix",
    amountIn: "123456789",
    sourceChainId: "osmosis-1",
    destinationChainId: "epix_1916-1",
  });
  expect(swapSelection(draft, pending)).toMatchObject({
    direction: "to-epix",
    inputDenom: pending.inputDenom,
    outputDenom: "aepix",
    amount: "123.456789",
  });
  expect(swapInputAmount(swapSelection(draft, pending))).toBe(pending.amountIn);
});

test("changing direction immediately removes the old quote and its approval", () => {
  const oldKey = JSON.stringify(swapSelection(draft));
  const nextKey = JSON.stringify(flipSwapSelection(swapSelection(draft)));
  const oldQuote = { ...quote, key: oldKey };
  const flipped = beginQuoteRefresh(oldQuote, nextKey, false);
  expect(flipped).toEqual({ key: nextKey, loading: false });
  expect(isQuoteConfirmable(oldQuote, nextKey, review, true, 1)).toBe(false);
});

test("a flipped form retains its direction, units and matching source chain", () => {
  const reverse = {
    ...flipSwapSelection(swapSelection(draft)),
    amount: "1.25",
  };
  expect(swapSelection(swapSelectionDraft(reverse))).toEqual(reverse);
  expect(swapChainIds(reverse.direction)).toEqual({
    sourceChainId: "osmosis-1",
    destinationChainId: "epix_1916-1",
  });
  const forward = flipSwapSelection(reverse);
  expect(swapSelection(swapSelectionDraft(forward))).toEqual(forward);
  expect(swapChainIds(forward.direction)).toEqual({
    sourceChainId: "epix_1916-1",
    destinationChainId: "osmosis-1",
  });
});
