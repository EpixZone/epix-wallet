import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import { useSearchParams } from "react-router-dom";
import { DSColor, DSTypography } from "@keplr-wallet/design-system";
import { CoinPretty } from "@keplr-wallet/unit";
import { Currency } from "@keplr-wallet/types";
import { requireCosmosInfo, getKeplrFromWindow } from "@keplr-wallet/stores";
import { Buffer } from "buffer/";
import { useStore } from "../../stores";
import { HeaderLayout } from "../../layouts/header";
import { MainHeaderLayout } from "../main/layouts/header";
import { guardedBroadcast, isPendingTransaction } from "./execution";
import { transactionExplorerUrl } from "./explorer";
import { useSwapDraft } from "./use-draft";
import {
  PreparationProgress,
  PreparationSteps,
  StepProgress,
  transactionProgress,
} from "./progress";
import { usePendingTransactions } from "./use-pending";
import { prepareReview, PreparedReview, SwapStage } from "./review";
import { Box } from "../../components/box";
import { Button } from "../../components/button";
import { TextInput } from "../../components/input";
import { Gutter } from "../../components/gutter";
import {
  EPIX_CHAIN_ID,
  OSMOSIS_CHAIN_ID,
  EPIX_CURRENCY,
  OSMOSIS_EPIX_CURRENCY,
  getEpixBridgePacketSequence,
} from "./bridge";
import { OSMOSIS_SWAP_TOKENS, minimumSwapOutput } from "./swap";

type Stage = SwapStage;
type Review = PreparedReview & { key: string; generation: number };

export const EpixSwapPage = observer(() => {
  const { chainStore } = useStore();
  const intl = useIntl();
  const chain = chainStore.hasModularChain(OSMOSIS_CHAIN_ID)
    ? chainStore.getModularChain(OSMOSIS_CHAIN_ID)
    : undefined;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!chain) return;
    chain.addCurrencies(...OSMOSIS_SWAP_TOKENS);
    setReady(true);
  }, [chain]);
  return ready && chain && chainStore.hasModularChain(EPIX_CHAIN_ID) ? (
    <SwapForm />
  ) : (
    <HeaderLayout title={intl.formatMessage({ id: "page.epix-swap.title" })}>
      <Box padding="1rem">
        <DSTypography>
          {intl.formatMessage({ id: "page.epix-swap.unsupported" })}
        </DSTypography>
      </Box>
    </HeaderLayout>
  );
});

function useSwapForm() {
  const intl = useIntl();
  const t = (key: string, values?: Record<string, string>) =>
    intl.formatMessage({ id: `page.epix-swap.${key}` }, values);
  const { chainStore, accountStore, queriesStore, keyRingStore } = useStore();
  const [params] = useSearchParams();
  const sourceChain = params.get("chainId");
  const sourceDenom = params.get("coinMinimalDenom");
  const initialToken = OSMOSIS_SWAP_TOKENS.findIndex(
    (token) => token.coinMinimalDenom === sourceDenom
  );
  const unsupported =
    !!sourceChain &&
    !(
      (sourceChain === EPIX_CHAIN_ID &&
        (!sourceDenom || sourceDenom === "aepix")) ||
      (sourceChain === OSMOSIS_CHAIN_ID && initialToken >= 0)
    );
  const epixAccount = accountStore.getAccount(EPIX_CHAIN_ID);
  const osmoAccount = accountStore.getAccount(OSMOSIS_CHAIN_ID);
  const owner = JSON.stringify([
    keyRingStore.selectedKeyInfo?.id,
    epixAccount.bech32Address,
    osmoAccount.bech32Address,
  ]);
  const ownerReady =
    !!keyRingStore.selectedKeyInfo &&
    !!epixAccount.bech32Address &&
    !!osmoAccount.bech32Address;
  const draftRecovery = useSwapDraft(
    ownerReady ? JSON.stringify([owner, sourceChain, sourceDenom]) : undefined,
    {
      stage: sourceChain === OSMOSIS_CHAIN_ID ? "swap" : "deposit",
      inputIndex: Math.max(initialToken, 0),
      outputIndex: initialToken === 1 ? 0 : 1,
      amount: "",
      slippage: 100,
      feeIndex: 3,
    },
    true
  );
  const { stage, inputIndex, outputIndex, amount, slippage, feeIndex } =
    draftRecovery.draft;
  const setStage = (value: Stage) =>
    draftRecovery.update({ stage: value, amount: "" });
  const setInputIndex = (value: number) =>
    draftRecovery.update({ inputIndex: value });
  const setOutputIndex = (value: number) =>
    draftRecovery.update({ outputIndex: value });
  const setAmount = (value: string) => draftRecovery.update({ amount: value });
  const setSlippage = (value: number) =>
    draftRecovery.update({ slippage: value });
  const setFeeIndex = (value: number) =>
    draftRecovery.update({ feeIndex: value });
  const [progress, setProgress] = useState<PreparationProgress>("idle");
  const [review, setReview] = useState<Review>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController>();
  const attempt = useRef(0);
  const epixChain = requireCosmosInfo(
    chainStore.getModularChain(EPIX_CHAIN_ID)
  );
  const osmoChain = requireCosmosInfo(
    chainStore.getModularChain(OSMOSIS_CHAIN_ID)
  );
  const sourceAccount = stage === "deposit" ? epixAccount : osmoAccount;
  const sourceChainId = stage === "deposit" ? EPIX_CHAIN_ID : OSMOSIS_CHAIN_ID;
  const sourceCurrencies = {
    deposit: EPIX_CURRENCY,
    withdraw: OSMOSIS_EPIX_CURRENCY,
    swap: OSMOSIS_SWAP_TOKENS[inputIndex],
  };
  const targetCurrencies = {
    deposit: OSMOSIS_EPIX_CURRENCY,
    withdraw: EPIX_CURRENCY,
    swap: OSMOSIS_SWAP_TOKENS[outputIndex],
  };
  const sourceCurrency = sourceCurrencies[stage];
  const targetCurrency = targetCurrencies[stage];
  const targetAccount = stage === "withdraw" ? epixAccount : osmoAccount;
  const targetChainId = stage === "withdraw" ? EPIX_CHAIN_ID : OSMOSIS_CHAIN_ID;
  const balanceQuery = queriesStore
    .get(sourceChainId)
    .queryBalances.getQueryBech32Address(sourceAccount.bech32Address)
    .getBalance(sourceCurrency);
  const feeCurrency =
    stage === "deposit" ? EPIX_CURRENCY : OSMOSIS_SWAP_TOKENS[feeIndex];
  const feeQuery = queriesStore
    .get(sourceChainId)
    .queryBalances.getQueryBech32Address(sourceAccount.bech32Address)
    .getBalance(feeCurrency);
  const targetQuery = queriesStore
    .get(targetChainId)
    .queryBalances.getQueryBech32Address(targetAccount.bech32Address)
    .getBalance(targetCurrency);
  const readWalletContext = () => {
    if (keyRingStore.status !== "unlocked") return undefined;
    try {
      const liveEpix = requireCosmosInfo(
        chainStore.getModularChain(EPIX_CHAIN_ID)
      );
      const liveOsmo = requireCosmosInfo(
        chainStore.getModularChain(OSMOSIS_CHAIN_ID)
      );
      return JSON.stringify([
        keyRingStore.selectedKeyInfo?.id,
        accountStore.getAccount(EPIX_CHAIN_ID).bech32Address,
        accountStore.getAccount(OSMOSIS_CHAIN_ID).bech32Address,
        liveEpix.rest,
        liveEpix.rpc,
        liveOsmo.rest,
        liveOsmo.rpc,
      ]);
    } catch {
      return undefined;
    }
  };
  const walletContext = readWalletContext();
  const key = JSON.stringify([
    walletContext,
    epixAccount.bech32Address,
    osmoAccount.bech32Address,
    stage,
    amount,
    inputIndex,
    outputIndex,
    slippage,
    feeIndex,
    epixChain.rest,
    epixChain.rpc,
    osmoChain.rest,
    osmoChain.rpc,
  ]);
  const pending = usePendingTransactions(owner, {
    epix: epixChain.rest,
    osmosis: osmoChain.rest,
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  const currentKey = useRef(key);
  currentKey.current = key;

  useEffect(() => {
    attempt.current += 1;
    request.current?.abort();
    setReview(undefined);
    setError("");
    setBusy(false);
    setProgress("idle");
    return () => request.current?.abort();
  }, [key]);

  const refresh = async () => {
    await Promise.all([
      balanceQuery?.waitFreshResponse(),
      feeQuery?.waitFreshResponse(),
      targetQuery?.waitFreshResponse(),
    ]);
  };

  const hasPending = pending.transactions.some(
    (transaction) =>
      isPendingTransaction(transaction) &&
      (transaction.direction ?? "swap") === stage
  );
  const prepare = async () => {
    if (!draftRecovery.ready || !pending.ready || hasPending) return;
    const controller = new AbortController();
    const generation = ++attempt.current;
    const isCurrent = () =>
      mounted.current &&
      currentKey.current === key &&
      attempt.current === generation &&
      walletContext !== undefined &&
      readWalletContext() === walletContext;
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setProgress("preparing");
    setReview(undefined);
    setError("");
    try {
      await draftRecovery.save();
      // Explicitly opening a review enables the destination network in this vault.
      // This keeps deposited funds discoverable on Home after this page closes.
      const vaultId = keyRingStore.selectedKeyInfo?.id;
      if (!vaultId) throw new Error(t("loading"));
      await chainStore.enableChainInfoInUIWithVaultId(
        vaultId,
        OSMOSIS_CHAIN_ID
      );
      if (!isCurrent()) return;
      const prepared = await prepareReview({
        stage,
        amount,
        sourceCurrency,
        targetCurrency,
        feeCurrency,
        sourceAccount,
        targetAccount,
        epixChain,
        osmoChain,
        balanceQuery,
        feeQuery,
        targetQuery,
        feeQueries: queriesStore.get(OSMOSIS_CHAIN_ID).osmosis,
        slippage,
        signal: controller.signal,
        messages: {
          loading: t("loading"),
          insufficient: t("insufficient"),
          noFeeBalance: t("no-fee-balance"),
        },
      });
      if (!controller.signal.aborted && isCurrent()) {
        setReview({ ...prepared, key, generation });
        setProgress("review");
      }
    } catch (e) {
      if (!controller.signal.aborted && isCurrent()) {
        setError(e instanceof Error ? e.message : t("unsupported"));
        setProgress("idle");
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  const submit = async () => {
    if (
      review?.key !== key ||
      review.generation !== attempt.current ||
      busy ||
      hasPending ||
      !draftRecovery.ready ||
      !pending.ready
    )
      return;
    const isCurrent = () =>
      mounted.current &&
      currentKey.current === key &&
      review.generation === attempt.current &&
      walletContext !== undefined &&
      readWalletContext() === walletContext;
    if (Date.now() >= review.expiresAt) {
      setReview(undefined);
      setError(t("expired"));
      return;
    }
    setBusy(true);
    setProgress("signing");
    setError("");

    const submissionId = crypto.randomUUID();
    let broadcastHash = "";
    let cancelledBeforeSubmission = false;
    try {
      await review.tx.send(
        review.fee,
        "",
        {
          sendTx: guardedBroadcast({
            chainId: sourceChainId,
            expiresAt: review.expiresAt,
            isCurrent,
            getProvider: getKeplrFromWindow,
            beforeBroadcast: async (hash) => {
              await pending.record(
                {
                  chainId: sourceChainId,
                  hash,
                  confirmed: false,
                  direction: stage === "swap" ? undefined : stage,
                  submissionUnknown: true,
                  submissionAttempts: { [submissionId]: "unknown" },
                },
                true
              );
              broadcastHash = hash;
              if (isCurrent()) setProgress("idle");
            },
            onNotBroadcast: async (hash) => {
              cancelledBeforeSubmission = true;
              await pending.record({
                chainId: sourceChainId,
                hash,
                confirmed: false,
                direction: stage === "swap" ? undefined : stage,
                cancelled: true,
                submissionAttempts: { [submissionId]: "cancelled" },
              });
            },
          }),
        },
        {
          onBroadcasted: (hash) => {
            broadcastHash = Buffer.from(hash).toString("hex").toUpperCase();
            void pending.record({
              chainId: sourceChainId,
              hash: broadcastHash,
              submissionUnknown: false,
              confirmed: false,
              direction: stage === "swap" ? undefined : stage,
            });
            if (isCurrent()) {
              setBusy(false);
              setReview(undefined);
              setProgress("idle");
            }
          },
          onFulfill: (tx) => {
            void pending.record({
              chainId: sourceChainId,
              hash: broadcastHash,
              direction: stage === "swap" ? undefined : stage,
              confirmed: true,
              failed: !!tx.code,
              packetSequence:
                stage === "swap"
                  ? undefined
                  : getEpixBridgePacketSequence(stage, tx.events ?? []),
            });
            if (!isCurrent()) return;
            setBusy(false);
            setReview(undefined);
            setProgress("idle");
            if (tx.code)
              setError(
                typeof tx.raw_log === "string"
                  ? tx.raw_log
                  : "Transaction failed"
              );
            void refresh().catch(() => setError(t("loading")));
          },
        }
      );
    } catch (e) {
      if (isCurrent()) {
        let message = e instanceof Error ? e.message : t("unsupported");
        if (broadcastHash) message = t("submission-uncertain");
        if (cancelledBeforeSubmission) message = t("progress-cancelled");
        setError(message);
        setBusy(false);
        setReview(undefined);
        setProgress("idle");
      }
    }
  };

  return {
    t,
    stage,
    setStage,
    amount,
    setAmount,
    inputIndex,
    setInputIndex,
    outputIndex,
    setOutputIndex,
    slippage,
    setSlippage,
    feeIndex,
    setFeeIndex,
    review,
    cancelReview: () => {
      setReview(undefined);
      setProgress("idle");
    },
    error,
    setError,
    busy,
    unsupported,
    sourceCurrency,
    targetCurrency,
    balanceQuery,
    sourceAccount,
    targetAccount,
    refresh,
    prepare,
    submit,
    pending,
    progress,
    draftRecovery,
    hasPending,
  };
}

const display = (currency: Currency, minimal: string) =>
  new CoinPretty(currency, minimal).trim(true).toString();

const SwapForm = observer(() => {
  const state = useSwapForm();
  const {
    t,
    stage,
    setStage,
    amount,
    setAmount,
    inputIndex,
    setInputIndex,
    outputIndex,
    setOutputIndex,
    slippage,
    setSlippage,
    feeIndex,
    setFeeIndex,
    review,
    error,
    setError,
    busy,
    unsupported,
    sourceCurrency,
    balanceQuery,
    sourceAccount,
    targetAccount,
    refresh,
    prepare,
    pending,
    progress,
    draftRecovery,
    hasPending,
  } = state;
  return (
    <MainHeaderLayout>
      <DSTypography as="h1" size="displayXxs" style={{ padding: "0 1rem" }}>
        {t("title")}
      </DSTypography>
      <Box
        padding="1rem"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          paddingBottom: "5rem",
        }}
      >
        <DSTypography as="p" size="textSm" color={DSColor.typography.secondary}>
          {t("description")}
        </DSTypography>
        <RecoveryNotice t={t} draft={draftRecovery} />
        <PreparationSteps t={t} progress={progress} bridge={stage !== "swap"} />
        <fieldset
          disabled={!draftRecovery.ready || !pending.ready}
          style={{ border: 0, padding: 0, margin: 0, display: "contents" }}
        >
          <Box style={{ display: "flex", gap: "0.5rem" }}>
            {(["deposit", "swap", "withdraw"] as const).map((value) => (
              <Button
                key={value}
                size="small"
                text={t(value)}
                color={stage === value ? "primary" : "secondary"}
                disabled={busy}
                onClick={() => {
                  setStage(value);
                  setAmount("");
                }}
              />
            ))}
          </Box>
          <DSTypography as="p" size="textSm">
            {t(`${stage}-description`)}
          </DSTypography>
          {unsupported ? (
            <DSTypography as="p" size="textSm">
              {t("unsupported")}
            </DSTypography>
          ) : (
            <React.Fragment>
              {stage === "swap" && (
                <Box style={{ display: "flex", gap: "0.75rem" }}>
                  <label>
                    {t("from")}
                    <select
                      style={selectStyle}
                      aria-label={t("from")}
                      value={inputIndex}
                      disabled={busy}
                      onChange={(event) =>
                        setInputIndex(Number(event.target.value))
                      }
                    >
                      {OSMOSIS_SWAP_TOKENS.map((currency, index) => (
                        <option key={currency.coinMinimalDenom} value={index}>
                          {currency.coinDenom}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("to")}
                    <select
                      style={selectStyle}
                      aria-label={t("to")}
                      value={outputIndex}
                      disabled={busy}
                      onChange={(event) =>
                        setOutputIndex(Number(event.target.value))
                      }
                    >
                      {OSMOSIS_SWAP_TOKENS.map((currency, index) => (
                        <option key={currency.coinMinimalDenom} value={index}>
                          {currency.coinDenom}
                        </option>
                      ))}
                    </select>
                  </label>
                </Box>
              )}
              <TextInput
                label={`${t("amount")} (${sourceCurrency.coinDenom})`}
                value={amount}
                disabled={busy}
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
              />
              <DSTypography as="p" size="textSm">
                {balanceQuery?.balance.isReady
                  ? t("balance", {
                      amount: balanceQuery.balance.trim(true).toString(),
                    })
                  : t("loading")}
              </DSTypography>
              <DSTypography
                as="p"
                size="textXs"
                color={DSColor.typography.secondary}
                style={{ overflowWrap: "anywhere" }}
              >
                {t("recipient")}: {targetAccount.bech32Address || "..."}
              </DSTypography>
              {stage === "swap" && (
                <label>
                  {t("slippage")}
                  <select
                    style={selectStyle}
                    aria-label={t("slippage")}
                    value={slippage}
                    disabled={busy}
                    onChange={(event) =>
                      setSlippage(Number(event.target.value))
                    }
                  >
                    <option value={50}>0.5%</option>
                    <option value={100}>1%</option>
                    <option value={300}>3%</option>
                  </select>
                </label>
              )}
              {stage !== "deposit" && (
                <React.Fragment>
                  <label>
                    {t("fee-token")}
                    <select
                      style={selectStyle}
                      aria-label={t("fee-token")}
                      value={feeIndex}
                      disabled={busy}
                      onChange={(event) =>
                        setFeeIndex(Number(event.target.value))
                      }
                    >
                      {[3, 1, 2].map((index) => (
                        <option key={index} value={index}>
                          {OSMOSIS_SWAP_TOKENS[index].coinDenom}
                        </option>
                      ))}
                    </select>
                  </label>
                  <DSTypography
                    as="p"
                    size="textSm"
                    color={DSColor.typography.secondary}
                  >
                    {t("fee-help")}
                  </DSTypography>
                </React.Fragment>
              )}
              {stage === "swap" && (
                <Button
                  text={t("get-osmo")}
                  mode="ghost"
                  disabled={busy || inputIndex === 3}
                  onClick={() => setOutputIndex(3)}
                />
              )}
              {stage === "swap" && outputIndex === 3 && (
                <DSTypography as="p" size="textSm">
                  {t("get-osmo-help")}
                </DSTypography>
              )}
              <Button
                text={t("refresh")}
                mode="ghost"
                disabled={busy}
                onClick={() => {
                  void refresh().catch(() => setError(t("loading")));
                }}
              />
              {error && (
                <DSTypography as="p" size="textSm" role="alert">
                  {t("error", { reason: error })}
                </DSTypography>
              )}
              {review && <ReviewPanel {...state} review={review} />}
              {!review && (
                <Button
                  text={t("review")}
                  disabled={
                    busy ||
                    hasPending ||
                    !amount ||
                    !sourceAccount.isReadyToSendTx ||
                    !targetAccount.isReadyToSendTx
                  }
                  isLoading={busy}
                  onClick={() => {
                    void prepare();
                  }}
                />
              )}
            </React.Fragment>
          )}
        </fieldset>
        <PendingPanel t={t} pending={pending} />
        <Gutter size="0.5rem" />
      </Box>
    </MainHeaderLayout>
  );
});

function ReviewPanel({
  t,
  targetCurrency,
  slippage,
  review,
  busy,
  submit,
  cancelReview,
  hasPending,
}: ReturnType<typeof useSwapForm> & { review: Review }) {
  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      {review.quote && (
        <React.Fragment>
          <DSTypography as="p" size="textSm">
            {t("estimate", {
              amount: display(targetCurrency, review.quote.amountOut),
            })}
          </DSTypography>
          <DSTypography as="p" size="textSm">
            {t("minimum", {
              amount: display(
                targetCurrency,
                minimumSwapOutput(review.quote.amountOut, slippage)
              ),
            })}
          </DSTypography>
        </React.Fragment>
      )}
      <DSTypography as="p" size="textSm">
        {t("fee", {
          amount: display(review.feeCurrency, review.fee.amount[0].amount),
        })}
      </DSTypography>
      <Button
        text={t("confirm")}
        disabled={busy || hasPending}
        isLoading={busy}
        onClick={() => {
          void submit();
        }}
      />
      <Button
        text={t("cancel")}
        mode="ghost"
        disabled={busy}
        onClick={cancelReview}
      />
    </Box>
  );
}

const selectStyle: React.CSSProperties = {
  display: "block",
  marginTop: "0.25rem",
  padding: "0.5rem",
  maxWidth: "100%",
  color: DSColor.typography.primary,
  background: DSColor.background.surface.surface,
};

function RecoveryNotice({
  t,
  draft,
}: {
  t: ReturnType<typeof useSwapForm>["t"];
  draft: ReturnType<typeof useSwapDraft>;
}) {
  let key: string | undefined;
  if (draft.error) key = "storage-unavailable";
  else if (!draft.ready) key = "draft-loading";
  else if (draft.restored) key = "draft-restored";
  return key ? (
    <div>
      <DSTypography as="p" size="textSm" role="status">
        {t(key)}
      </DSTypography>
      {draft.error && (
        <Button mode="ghost" text={t("retry-recovery")} onClick={draft.retry} />
      )}
    </div>
  ) : null;
}

function PendingPanel({
  t,
  pending,
}: Pick<ReturnType<typeof useSwapForm>, "t" | "pending">) {
  if (!pending.transactions.length && !pending.error) return null;
  return (
    <Box style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <DSTypography as="p" size="textSm">
        {t("recovery-help")}
      </DSTypography>
      {pending.error && (
        <DSTypography as="p" size="textSm" role="status">
          {t("tracking-unavailable")}
        </DSTypography>
      )}
      <Button
        text={t("check-status")}
        mode="ghost"
        disabled={pending.checking}
        isLoading={pending.checking}
        onClick={() => {
          void pending.refresh();
        }}
      />
      {pending.transactions.map((transaction) => (
        <Box
          key={transaction.hash}
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <DSTypography size="textSm">
            {t(transaction.direction ?? "swap")}
          </DSTypography>
          <StepProgress t={t} {...transactionProgress(transaction)} />
          {transaction.submissionUnknown &&
            isPendingTransaction(transaction) && (
              <DSTypography as="p" size="textSm">
                {t("submission-uncertain")}
              </DSTypography>
            )}
          <DSTypography
            as="p"
            size="textXs"
            style={{ overflowWrap: "anywhere" }}
          >
            {t("tx", { hash: transaction.hash })}
          </DSTypography>
          <a
            href={transactionExplorerUrl(transaction.chainId, transaction.hash)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: DSColor.typography.brand }}
          >
            {t("view-transaction")}
          </a>
        </Box>
      ))}
    </Box>
  );
}
