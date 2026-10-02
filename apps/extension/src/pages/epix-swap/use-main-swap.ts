import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import {
  EpixSwapReview,
  PrepareEpixSwapMsg,
  StartEpixSwapMsg,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { CoinPretty } from "@keplr-wallet/unit";
import { useStore } from "../../stores";
import {
  EPIX_CHAIN_ID,
  EPIX_CURRENCY,
  OSMOSIS_CHAIN_ID,
  OSMOSIS_SWAP_TOKENS,
  OSMOSIS_SWAP_OUTPUT_OPTIONS,
  OSMOSIS_SWAP_FEE_OPTIONS,
} from "./tokens";
import { parseAmountToMinimal } from "./amount";
import { useSwapDraft } from "./use-draft";
import { useRouteRegistry } from "./use-route-registry";
import { swapRequester, useSwapOperations } from "./use-operations";
import { quoteView, workflowView } from "./flow-view";
import {
  currentOperation,
  swapSelection,
  boundAccountReview,
  quoteDisplayState,
  recoveryMessage,
  quoteMessage,
  SwapQuoteState,
  beginQuoteRefresh,
  failQuoteRefresh,
  isQuoteConfirmable,
  DEFAULT_SWAP_DRAFT,
} from "./main-swap-state";
import { EpixMainSwapViewProps, MainSwapSelection } from "./main-swap-view";

function inputAmount(value: string): string | undefined {
  if (!value || value === ".") return undefined;
  const withZero = value.startsWith(".") ? `0${value}` : value;
  const normalized = withZero.endsWith(".") ? withZero.slice(0, -1) : withZero;
  try {
    return parseAmountToMinimal(normalized, 18);
  } catch {
    return undefined;
  }
}

export function useMainSwap(): EpixMainSwapViewProps {
  const intl = useIntl();
  const t = useCallback(
    (key: string, values?: Record<string, string>) =>
      intl.formatMessage({ id: `page.epix-swap.${key}` }, values),
    [intl]
  );
  const { chainStore, accountStore, queriesStore, keyRingStore, priceStore } =
    useStore();
  const vaultId = keyRingStore.selectedKeyInfo?.id;
  const epixAccount = accountStore.getAccount(EPIX_CHAIN_ID);
  const osmoAccount = accountStore.getAccount(OSMOSIS_CHAIN_ID);
  const owner = JSON.stringify([
    vaultId,
    epixAccount.bech32Address,
    osmoAccount.bech32Address,
  ]);
  const ownerReady =
    !!vaultId &&
    keyRingStore.status === "unlocked" &&
    epixAccount.isReadyToSendTx &&
    osmoAccount.isReadyToSendTx &&
    !!epixAccount.bech32Address &&
    !!osmoAccount.bech32Address;
  const draft = useSwapDraft(
    ownerReady ? `main-swap/${owner}` : undefined,
    DEFAULT_SWAP_DRAFT,
    true
  );
  const operations = useSwapOperations(ownerReady ? vaultId : undefined, owner);
  const { operation, unfinished, resumeId } = currentOperation(
    operations.operations
  );
  const routeRunning = !!unfinished && !resumeId;
  const selection = swapSelection(draft.draft, unfinished);
  const amountMinimal = inputAmount(selection.amount);
  const [retry, setRetry] = useState(0);
  const [enabled, setEnabled] = useState({ owner, ready: false, error: "" });
  useEffect(() => {
    if (!ownerReady || !vaultId) return;
    let disposed = false;
    setEnabled({ owner, ready: false, error: "" });
    void (async () => {
      try {
        await chainStore.enableChainInfoInUIWithVaultId(
          vaultId,
          OSMOSIS_CHAIN_ID
        );
        if (!disposed) setEnabled({ owner, ready: true, error: "" });
      } catch (error) {
        if (!disposed)
          setEnabled({
            owner,
            ready: false,
            error: error instanceof Error ? error.message : t("unsupported"),
          });
      }
    })();
    return () => {
      disposed = true;
    };
  }, [ownerReady, vaultId, owner, chainStore, retry, t]);
  const isEnabled = ownerReady && enabled.owner === owner && enabled.ready;
  const canPrepare =
    isEnabled &&
    draft.ready &&
    !draft.error &&
    operations.ready &&
    !operations.error &&
    !routeRunning;
  const requestKey = JSON.stringify([
    owner,
    amountMinimal,
    selection.outputDenom,
    selection.feeDenom,
    selection.slippageBps,
    resumeId,
  ]);
  const currentRequest = useRef(requestKey);
  currentRequest.current = requestKey;
  const [quote, setQuote] = useState<SwapQuoteState>({
    key: requestKey,
    loading: false,
  });
  const currentQuote = useRef(quote);
  const preparationReady = useRef(canPrepare);
  preparationReady.current = canPrepare;
  const updateQuote = useCallback((next: SwapQuoteState) => {
    // Close the approval gate before React commits a refresh or replacement.
    currentQuote.current = next;
    setQuote(next);
  }, []);
  const [refreshQuote, setRefreshQuote] = useState(0);
  const requestQuoteRefresh = useCallback(() => {
    updateQuote(
      beginQuoteRefresh(
        currentQuote.current,
        requestKey,
        !!amountMinimal && canPrepare
      )
    );
    setRefreshQuote((value) => value + 1);
  }, [requestKey, amountMinimal, canPrepare, updateQuote]);
  const prepare = useCallback(() => {
    if (!vaultId || !amountMinimal) return Promise.resolve(undefined);
    return swapRequester.sendMessage(
      BACKGROUND_PORT,
      new PrepareEpixSwapMsg(
        vaultId,
        amountMinimal,
        selection.outputDenom,
        selection.slippageBps,
        selection.feeDenom,
        resumeId
      )
    );
  }, [
    vaultId,
    amountMinimal,
    selection.outputDenom,
    selection.slippageBps,
    selection.feeDenom,
    resumeId,
  ]);
  useEffect(() => {
    let disposed = false;
    updateQuote(
      beginQuoteRefresh(
        currentQuote.current,
        requestKey,
        !!amountMinimal && canPrepare
      )
    );
    if (!amountMinimal || !canPrepare) return;
    const timer = setTimeout(() => {
      void prepare()
        .then((review) => {
          if (!disposed)
            updateQuote({ key: requestKey, review, loading: false });
        })
        .catch((error) => {
          if (!disposed)
            updateQuote(
              failQuoteRefresh(
                currentQuote.current,
                requestKey,
                error instanceof Error ? error.message : t("unsupported")
              )
            );
        });
    }, 500);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [
    requestKey,
    amountMinimal,
    canPrepare,
    prepare,
    refreshQuote,
    t,
    updateQuote,
  ]);
  useEffect(() => {
    if (!canPrepare || !amountMinimal || quote.loading) return;
    const timer = setInterval(requestQuoteRefresh, 20_000);
    return () => clearInterval(timer);
  }, [canPrepare, amountMinimal, quote.loading, requestQuoteRefresh]);
  const boundReview = boundAccountReview(
    quote,
    requestKey,
    canPrepare,
    epixAccount.bech32Address,
    osmoAccount.bech32Address
  );
  const routeRegistry = useRouteRegistry(!!boundReview);
  const [confirmation, setConfirmation] = useState({
    owner,
    busy: false,
    error: "",
  });
  const confirmingRef = useRef(false);
  const confirming = confirmation.owner === owner && confirmation.busy;
  const canConfirm =
    isQuoteConfirmable(
      quote,
      requestKey,
      boundReview,
      canPrepare,
      Date.now()
    ) && !confirming;
  const isCurrentApproval = (expected: EpixSwapReview) => {
    const source = accountStore.getAccount(EPIX_CHAIN_ID);
    const destination = accountStore.getAccount(OSMOSIS_CHAIN_ID);
    const ready =
      preparationReady.current &&
      currentRequest.current === requestKey &&
      keyRingStore.status === "unlocked" &&
      keyRingStore.selectedKeyInfo?.id === vaultId &&
      source.isReadyToSendTx &&
      destination.isReadyToSendTx;
    const currentReview = boundAccountReview(
      currentQuote.current,
      requestKey,
      ready,
      source.bech32Address,
      destination.bech32Address
    );
    return (
      currentReview?.id === expected.id &&
      isQuoteConfirmable(
        currentQuote.current,
        requestKey,
        currentReview,
        ready,
        Date.now()
      )
    );
  };
  const confirm = async () => {
    if (
      !boundReview ||
      confirmingRef.current ||
      !isCurrentApproval(boundReview)
    )
      return;
    confirmingRef.current = true;
    setConfirmation({ owner, busy: true, error: "" });
    try {
      await draft.save();
      if (!isCurrentApproval(boundReview)) return;
      await swapRequester.sendMessage(
        BACKGROUND_PORT,
        new StartEpixSwapMsg(boundReview.id)
      );
      updateQuote({ key: requestKey, loading: false });
      await operations.load();
    } catch (error) {
      if (currentRequest.current === requestKey) {
        setConfirmation({
          owner,
          busy: false,
          error: error instanceof Error ? error.message : t("unsupported"),
        });
        updateQuote({ key: requestKey, loading: false });
        await operations.load();
        setRefreshQuote((value) => value + 1);
      }
    } finally {
      confirmingRef.current = false;
      setConfirmation((previous) =>
        previous.owner === owner ? { ...previous, busy: false } : previous
      );
    }
  };
  const balanceQuery = queriesStore
    .get(EPIX_CHAIN_ID)
    .queryBalances.getQueryBech32Address(epixAccount.bech32Address)
    .getBalance(EPIX_CURRENCY);
  const refresh = async () => {
    if (!draft.ready || draft.error) draft.retry();
    if (!isEnabled) setRetry((value) => value + 1);
    requestQuoteRefresh();
    await operations.refresh(unfinished?.id);
    await balanceQuery?.waitFreshResponse();
  };
  const changeSelection = (update: Partial<MainSwapSelection>) => {
    if (unfinished) return;
    const next = { ...selection, ...update };
    draft.update({
      amount: next.amount,
      slippage: next.slippageBps,
      outputIndex: OSMOSIS_SWAP_TOKENS.findIndex(
        (token) => token.coinMinimalDenom === next.outputDenom
      ),
      feeIndex: OSMOSIS_SWAP_TOKENS.findIndex(
        (token) => token.coinMinimalDenom === next.feeDenom
      ),
    });
    setConfirmation({ owner, busy: false, error: "" });
  };
  const quoteState = quoteDisplayState(quote, requestKey, boundReview);
  const recoveryError = recoveryMessage(
    draft.error,
    operations.error,
    enabled,
    owner,
    t
  );
  const quoteError = quoteMessage(quote, requestKey, confirmation, owner);
  const inputPrice =
    ownerReady && amountMinimal
      ? priceStore.calculatePrice(new CoinPretty(EPIX_CURRENCY, amountMinimal))
      : undefined;
  return {
    t,
    selection,
    outputOptions: OSMOSIS_SWAP_OUTPUT_OPTIONS,
    feeOptions: OSMOSIS_SWAP_FEE_OPTIONS,
    availableBalance:
      ownerReady && balanceQuery?.balance.isReady
        ? balanceQuery.balance.trim(true).toString()
        : undefined,
    inputFiat: inputPrice?.toString(),
    osmosisAddress: ownerReady ? osmoAccount.bech32Address : "",
    osmosisEnabled: isEnabled,
    quoteState,
    quote: boundReview ? quoteView(boundReview, routeRegistry) : undefined,
    quoteError,
    blockReason: boundReview?.blockReason,
    restoredDraft: draft.restored,
    recoveryError,
    controlsDisabled:
      !ownerReady || !draft.ready || !isEnabled || routeRunning || confirming,
    selectionLocked: !!unfinished,
    canConfirm,
    confirming,
    workflow: operation
      ? workflowView(operation, operations.checking, t)
      : undefined,
    onSelectionChange: changeSelection,
    onConfirm: () => {
      void confirm();
    },
    onRefresh: () => {
      void refresh().catch((error) =>
        setConfirmation({
          owner,
          busy: false,
          error: error instanceof Error ? error.message : t("loading"),
        })
      );
    },
  };
}
