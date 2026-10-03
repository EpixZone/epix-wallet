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
  OSMOSIS_CHAIN_ID,
  OSMOSIS_SWAP_OUTPUT_OPTIONS,
  OSMOSIS_SWAP_FEE_OPTIONS,
} from "./tokens";
import { useRouteRegistry } from "./use-route-registry";
import { swapRequester, useSwapOperations } from "./use-operations";
import { quoteView, workflowView } from "./flow-view";
import {
  currentOperation,
  swapSelection,
  swapInputCurrency,
  swapInputAmount,
  swapChainIds,
  swapSelectionDraft,
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
import { swapBalanceView } from "./swap-balance";

function isSwapOwnerReady({
  keyRingStore,
  accountStore,
}: ReturnType<typeof useStore>): boolean {
  const epix = accountStore.getAccount(EPIX_CHAIN_ID);
  const osmosis = accountStore.getAccount(OSMOSIS_CHAIN_ID);
  return (
    !!keyRingStore.selectedKeyInfo?.id &&
    keyRingStore.status === "unlocked" &&
    epix.isReadyToSendTx &&
    osmosis.isReadyToSendTx &&
    !!epix.bech32Address &&
    !!osmosis.bech32Address
  );
}

function swapInputValues(
  stores: ReturnType<typeof useStore>,
  selection: MainSwapSelection
) {
  const ownerReady = isSwapOwnerReady(stores);
  const currency = swapInputCurrency(selection);
  const amount = swapInputAmount(selection);
  const { sourceChainId } = swapChainIds(selection.direction);
  const source = stores.accountStore.getAccount(sourceChainId);
  const balanceQuery =
    ownerReady && currency
      ? stores.queriesStore
          .get(sourceChainId)
          .queryBalances.getQueryBech32Address(source.bech32Address)
          .getBalance(currency)
      : undefined;
  const inputPrice =
    ownerReady && amount && currency
      ? stores.priceStore.calculatePrice(new CoinPretty(currency, amount))
      : undefined;
  return { balanceQuery, balance: swapBalanceView(balanceQuery), inputPrice };
}

export function useMainSwap(): EpixMainSwapViewProps {
  const intl = useIntl();
  const t = useCallback(
    (key: string, values?: Record<string, string>) =>
      intl.formatMessage({ id: `page.epix-swap.${key}` }, values),
    [intl]
  );
  const stores = useStore();
  const { chainStore, accountStore, keyRingStore } = stores;
  const vaultId = keyRingStore.selectedKeyInfo?.id;
  const epixAccount = accountStore.getAccount(EPIX_CHAIN_ID);
  const osmoAccount = accountStore.getAccount(OSMOSIS_CHAIN_ID);
  const owner = JSON.stringify([
    vaultId,
    epixAccount.bech32Address,
    osmoAccount.bech32Address,
  ]);
  const ownerReady = isSwapOwnerReady(stores);
  const [form, setForm] = useState({ owner, draft: DEFAULT_SWAP_DRAFT });
  useEffect(() => {
    setForm({ owner, draft: DEFAULT_SWAP_DRAFT });
  }, [owner]);
  const operations = useSwapOperations(ownerReady ? vaultId : undefined, owner);
  const { operation, unfinished, resumeId } = currentOperation(
    operations.operations
  );
  const routeRunning = !!unfinished && !resumeId;
  const selection = swapSelection(
    form.owner === owner ? form.draft : DEFAULT_SWAP_DRAFT,
    unfinished
  );
  const amountMinimal = swapInputAmount(selection);
  const { sourceChainId, destinationChainId } = swapChainIds(
    selection.direction
  );
  const sourceAccount = accountStore.getAccount(sourceChainId);
  const destinationAccount = accountStore.getAccount(destinationChainId);
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
          EPIX_CHAIN_ID,
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
    isEnabled && operations.ready && !operations.error && !routeRunning;
  const requestKey = JSON.stringify([
    owner,
    amountMinimal,
    selection.direction,
    selection.inputDenom,
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
        selection.direction,
        selection.inputDenom,
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
    selection.direction,
    selection.inputDenom,
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
    sourceAccount.bech32Address,
    destinationAccount.bech32Address
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
    const source = accountStore.getAccount(sourceChainId);
    const destination = accountStore.getAccount(destinationChainId);
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
  const { balanceQuery, balance, inputPrice } = swapInputValues(
    stores,
    selection
  );
  const refresh = async () => {
    if (!isEnabled) setRetry((value) => value + 1);
    requestQuoteRefresh();
    await operations.refresh(unfinished?.id);
    await balanceQuery?.waitFreshResponse();
  };
  const changeSelection = (update: Partial<MainSwapSelection>) => {
    if (unfinished) return;
    // Revoke the displayed approval immediately, before the next render.
    updateQuote({ key: "", loading: false });
    setForm({
      owner,
      draft: swapSelectionDraft({ ...selection, ...update }),
    });
    setConfirmation({ owner, busy: false, error: "" });
  };
  const quoteState = quoteDisplayState(quote, requestKey, boundReview);
  const recoveryError = recoveryMessage(operations.error, enabled, owner, t);
  const quoteError = quoteMessage(quote, requestKey, confirmation, owner);
  return {
    t,
    selection,
    tokenOptions: OSMOSIS_SWAP_OUTPUT_OPTIONS,
    feeOptions: OSMOSIS_SWAP_FEE_OPTIONS,
    availableBalance: balance.amount,
    balanceError:
      balance.status === "error" ? t("balance-unavailable") : undefined,
    inputFiat: inputPrice?.toString(),
    destinationAddress: ownerReady ? destinationAccount.bech32Address : "",
    osmosisEnabled: isEnabled,
    quoteState,
    quote: boundReview ? quoteView(boundReview, routeRegistry) : undefined,
    quoteError,
    blockReason: boundReview?.blockReason,
    recoveryError,
    controlsDisabled: !ownerReady || !isEnabled || routeRunning || confirming,
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
