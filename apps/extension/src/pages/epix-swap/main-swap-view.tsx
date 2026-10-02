import React from "react";
import styled from "styled-components";
import {
  ChevronDownIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  DSColor,
  DSTypography,
} from "@keplr-wallet/design-system";
import { MainHeaderLayout } from "../main/layouts/header";
import { Box } from "../../components/box";
import { Button } from "../../components/button";
import { TextInput } from "../../components/input";
import {
  SwapQuoteRoute,
  SwapRouteSearch,
  SwapQuoteRefreshStatus,
} from "./swap-quote-route";
import type { EpixSwapDirection } from "@keplr-wallet/background";
import { flipSwapSelection } from "./main-swap-state";
import type { QuoteRouteHop } from "./quote-route";
export type TranslateProgress = (
  key: string,
  values?: Record<string, string>
) => string;

export type MainSwapSelection = {
  direction: EpixSwapDirection;
  inputDenom: string;
  amount: string;
  outputDenom: string;
  slippageBps: number;
  feeDenom: string;
};
export type MainSwapTokenOption = {
  denom: string;
  label: string;
};
export type MainSwapQuoteView = {
  expectedOutput: string;
  minimumOutput: string;
  bridgeNetworkFee?: string;
  osmosisNetworkFeeLimit?: string;
  approvalExpiresAt?: number;
  routes?: ReadonlyArray<QuoteRouteHop>;
  bridgeComplete?: boolean;
  swapComplete?: boolean;
};
export type MainSwapWorkflowView = {
  id: string;
  statusText: string;
  steps: ReadonlyArray<{
    id: string;
    title: string;
    state: "waiting" | "active" | "complete" | "failed";
    detail?: string;
    explorerUrl?: string;
  }>;
  error?: string;
  canResume: boolean;
  checking: boolean;
};
export type EpixMainSwapViewProps = Readonly<{
  t: TranslateProgress;
  selection: MainSwapSelection;
  tokenOptions: ReadonlyArray<MainSwapTokenOption>;
  feeOptions: ReadonlyArray<MainSwapTokenOption>;
  /** Exact human-readable input balance, including its symbol. */
  availableBalance?: string;
  balanceError?: string;
  inputFiat?: string;
  destinationAddress: string;
  osmosisEnabled: boolean;
  quoteState: "idle" | "loading" | "ready" | "refreshing" | "stale" | "error";
  quote?: MainSwapQuoteView;
  quoteError?: string;
  /** Quote estimation remains visible when fees or another prerequisite block execution. */
  blockReason?: string;
  restoredDraft: boolean;
  recoveryError?: string;
  controlsDisabled: boolean;
  selectionLocked?: boolean;
  canConfirm: boolean;
  confirming: boolean;
  workflow?: MainSwapWorkflowView;
  onSelectionChange: (update: Partial<MainSwapSelection>) => void;
  onConfirm: () => void;
  onRefresh: () => void;
}>;

/** Presentation only. The adapter owns quotes, enablement, approval and the background workflow. */
export function EpixMainSwapView(props: EpixMainSwapViewProps) {
  const { t, restoredDraft, recoveryError, workflow } = props;
  return (
    <MainHeaderLayout>
      <SwapContent
        padding="1rem"
        style={{ gap: "1rem", paddingBottom: "5rem" }}
      >
        <DSTypography as="h1" size="displayXxs">
          {t("main-title")}
        </DSTypography>
        <DSTypography as="p" size="textSm" color={DSColor.typography.secondary}>
          {t(
            props.selection.direction === "to-epix"
              ? "reverse-description"
              : "main-description"
          )}
        </DSTypography>
        {restoredDraft && (
          <DSTypography as="p" size="textSm" role="status">
            {t("draft-restored")}
          </DSTypography>
        )}
        {recoveryError && (
          <DSTypography as="p" size="textSm" role="alert">
            {recoveryError}
          </DSTypography>
        )}
        <SwapAmountCards {...props} />
        <SwapQuoteDetails {...props} />
        <SwapSubmitSection {...props} />
        {workflow && (
          <SwapWorkflowProgress
            t={t}
            workflow={workflow}
            onRefresh={props.onRefresh}
          />
        )}
      </SwapContent>
    </MainHeaderLayout>
  );
}

function SwapAmountCards({
  t,
  selection,
  tokenOptions,
  availableBalance,
  balanceError,
  inputFiat,
  quoteState,
  quote,
  controlsDisabled,
  selectionLocked = false,
  onSelectionChange,
}: EpixMainSwapViewProps) {
  const estimatedOutput = quote?.expectedOutput ?? t("enter-amount");
  const pendingBalance = balanceError ?? t("loading");
  const reverse = selection.direction === "to-epix";
  const selectedToken = tokenOptions.find(
    (option) =>
      option.denom === (reverse ? selection.inputDenom : selection.outputDenom)
  )?.label;
  const inputToken = reverse ? selectedToken : "EPIX";
  const outputToken = reverse ? "EPIX" : selectedToken;
  const showQuote =
    !!quote && ["ready", "refreshing", "stale"].includes(quoteState);
  return (
    <React.Fragment>
      <Panel>
        <Box
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <DSTypography size="textSm" color={DSColor.typography.secondary}>
            {t("you-pay")}
          </DSTypography>
          <DSTypography size="textSm">
            {reverse ? "Osmosis" : "EPIX · Epix"}
          </DSTypography>
        </Box>
        {reverse && (
          <TokenSelect
            label={t("pay-token")}
            value={selection.inputDenom}
            options={tokenOptions}
            disabled={controlsDisabled || selectionLocked}
            onChange={(inputDenom) =>
              onSelectionChange({ inputDenom, amount: "" })
            }
          />
        )}
        <TextInput
          label={t("amount")}
          value={selection.amount}
          placeholder="0.0"
          inputMode="decimal"
          disabled={controlsDisabled || selectionLocked}
          onChange={(event) =>
            onSelectionChange({ amount: event.target.value })
          }
        />
        {inputFiat && (
          <DSTypography size="textSm" color={DSColor.typography.secondary}>
            {inputFiat}
          </DSTypography>
        )}
        <DSTypography size="textXs" color={DSColor.typography.secondary}>
          {availableBalance
            ? t("balance", { amount: availableBalance })
            : pendingBalance}
        </DSTypography>
      </Panel>
      <DirectionButton
        type="button"
        aria-label={t("reverse-direction")}
        title={t("reverse-direction")}
        disabled={controlsDisabled || selectionLocked}
        onClick={() => onSelectionChange(flipSwapSelection(selection))}
      >
        <ArrowDownIcon size={20} aria-hidden />
        <ArrowUpIcon size={20} aria-hidden />
      </DirectionButton>
      <Panel>
        <DSTypography size="textSm" color={DSColor.typography.secondary}>
          {t(reverse ? "receive-on-epix" : "receive-on-osmosis")}
        </DSTypography>
        {reverse ? (
          <DSTypography size="textSm">EPIX · Epix</DSTypography>
        ) : (
          <TokenSelect
            label={t("receive-token")}
            value={selection.outputDenom}
            options={tokenOptions}
            disabled={controlsDisabled || selectionLocked}
            onChange={(outputDenom) => onSelectionChange({ outputDenom })}
          />
        )}
        {quoteState === "loading" ? (
          <SwapRouteSearch
            t={t}
            inputToken={inputToken}
            outputToken={outputToken}
          />
        ) : (
          <DSTypography
            as="p"
            size="displayXxs"
            role="status"
            aria-live="polite"
            style={{ overflowWrap: "anywhere" }}
          >
            {estimatedOutput}
          </DSTypography>
        )}
        {showQuote && (
          <SwapQuoteRefreshStatus
            t={t}
            refreshing={quoteState === "refreshing"}
            stale={quoteState === "stale"}
          />
        )}
        {showQuote && (quote?.routes || quote?.swapComplete) && (
          <SwapQuoteRoute
            t={t}
            routes={quote.routes ?? []}
            direction={selection.direction}
            swapComplete={quote.swapComplete}
            bridgeComplete={quote.bridgeComplete}
          />
        )}
      </Panel>
    </React.Fragment>
  );
}

function SwapQuoteDetails({
  t,
  selection,
  feeOptions,
  quote,
  quoteError,
  destinationAddress,
  osmosisEnabled,
  controlsDisabled,
  selectionLocked = false,
  onSelectionChange,
}: EpixMainSwapViewProps) {
  const feeLabel = feeOptions.find(
    (option) => option.denom === selection.feeDenom
  )?.label;
  return (
    <React.Fragment>
      <SettingsPanel aria-label={t("slippage-and-fees")}>
        <SettingsSummary>
          <DSTypography size="textSm">{t("slippage-and-fees")}</DSTypography>
          <DSTypography
            size="textXs"
            color={DSColor.typography.secondary}
            style={{ marginLeft: "auto" }}
          >
            {[`${selection.slippageBps / 100}%`, feeLabel]
              .filter(Boolean)
              .join(" · ")}
          </DSTypography>
          <ChevronDownIcon size={16} aria-hidden />
        </SettingsSummary>
        <SettingsContent>
          <Box
            style={{ flexDirection: "row", alignItems: "end", gap: "0.75rem" }}
          >
            <TokenSelect
              label={t("slippage")}
              value={String(selection.slippageBps)}
              options={[
                { denom: "50", label: "0.5%" },
                { denom: "100", label: "1%" },
                { denom: "300", label: "3%" },
              ]}
              disabled={controlsDisabled || selectionLocked}
              onChange={(value) =>
                onSelectionChange({ slippageBps: Number(value) })
              }
            />
            <TokenSelect
              label={t("fee-token")}
              value={selection.feeDenom}
              options={feeOptions}
              disabled={controlsDisabled || selectionLocked}
              onChange={(feeDenom) => onSelectionChange({ feeDenom })}
            />
          </Box>
          {quote && (
            <QuoteAmounts
              t={t}
              quote={quote}
              reverse={selection.direction === "to-epix"}
            />
          )}
          <DSTypography
            as="p"
            size="textXs"
            color={DSColor.typography.secondary}
          >
            {t(
              selection.direction === "to-epix"
                ? "reverse-fee-help"
                : "fee-help"
            )}
          </DSTypography>
          <DSTypography
            as="p"
            size="textXs"
            color={DSColor.typography.secondary}
            style={{ overflowWrap: "anywhere" }}
          >
            {t("recipient")}: {destinationAddress || "..."}
          </DSTypography>
          {osmosisEnabled && (
            <DSTypography
              as="p"
              size="textXs"
              color={DSColor.typography.secondary}
            >
              {t(
                selection.direction === "to-epix"
                  ? "epix-destination-enabled"
                  : "destination-enabled"
              )}
            </DSTypography>
          )}
        </SettingsContent>
      </SettingsPanel>
      {quoteError && (
        <DSTypography as="p" size="textSm" role="alert">
          {quoteError}
        </DSTypography>
      )}
    </React.Fragment>
  );
}

function QuoteAmounts({
  t,
  quote,
  reverse,
}: Readonly<{
  t: TranslateProgress;
  quote: MainSwapQuoteView;
  reverse: boolean;
}>) {
  const expiresAt = quote.approvalExpiresAt;
  const approvalMinutes =
    typeof expiresAt === "number" && Number.isFinite(expiresAt)
      ? Math.ceil(Math.max(0, expiresAt - Date.now()) / 60_000)
      : undefined;
  return (
    <React.Fragment>
      <QuoteLine label={t("minimum-received")} value={quote.minimumOutput} />
      <QuoteLine
        label={t(reverse ? "osmosis-bridge-fee" : "epix-network-fee")}
        value={quote.bridgeNetworkFee ?? "..."}
      />
      <QuoteLine
        label={t(reverse ? "osmosis-swap-fee" : "osmosis-network-fee")}
        value={quote.osmosisNetworkFeeLimit ?? "..."}
      />
      {approvalMinutes !== undefined && (
        <DSTypography as="p" size="textXs" color={DSColor.typography.secondary}>
          {t("approval-duration", { minutes: String(approvalMinutes) })}
        </DSTypography>
      )}
    </React.Fragment>
  );
}

function SwapSubmitSection({
  t,
  selection,
  blockReason,
  canConfirm,
  confirming,
  controlsDisabled,
  osmosisEnabled,
  quoteState,
  quote,
  onConfirm,
  onRefresh,
  workflow,
}: EpixMainSwapViewProps) {
  return (
    <React.Fragment>
      {blockReason && (
        <DSTypography as="p" size="textSm" role="status">
          {blockReason}
        </DSTypography>
      )}
      <DSTypography as="p" size="textXs" color={DSColor.typography.secondary}>
        {t(
          selection.direction === "to-epix"
            ? "reverse-swap-once-help"
            : "swap-once-help"
        )}
      </DSTypography>
      <Button
        text={t(workflow?.canResume ? "resume" : "swap")}
        disabled={
          confirming ||
          !canConfirm ||
          !quote?.bridgeNetworkFee ||
          !quote?.osmosisNetworkFeeLimit ||
          !osmosisEnabled ||
          controlsDisabled ||
          quoteState !== "ready"
        }
        isLoading={confirming}
        onClick={onConfirm}
      />
      <Button
        text={t("refresh-quote")}
        mode="ghost"
        disabled={
          confirming || quoteState === "loading" || quoteState === "refreshing"
        }
        onClick={onRefresh}
      />
    </React.Fragment>
  );
}

function TokenSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: ReadonlyArray<MainSwapTokenOption>;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  return (
    <label style={{ flex: 1, minWidth: 0 }}>
      <DSTypography
        as="span"
        size="textXs"
        color={DSColor.typography.secondary}
      >
        {label}
      </DSTypography>
      <Select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.denom} value={option.denom}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

function QuoteLine({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <Box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "0.75rem",
      }}
    >
      <DSTypography size="textXs" color={DSColor.typography.secondary}>
        {label}
      </DSTypography>
      <DSTypography
        size="textSm"
        style={{ textAlign: "right", overflowWrap: "anywhere" }}
      >
        {value}
      </DSTypography>
    </Box>
  );
}

export function SwapWorkflowProgress({
  t,
  workflow,
  onRefresh,
}: Readonly<{
  t: TranslateProgress;
  workflow: MainSwapWorkflowView;
  onRefresh: () => void;
}>) {
  const completed = workflow.steps.filter(
    (step) => step.state === "complete"
  ).length;
  return (
    <Panel>
      <DSTypography as="h2" size="textLg">
        {t("workflow-progress")}
      </DSTypography>
      <Progress
        value={completed}
        max={Math.max(1, workflow.steps.length)}
        aria-label={t("workflow-progress")}
        aria-valuetext={workflow.statusText}
      />
      <DSTypography as="p" size="textSm" role="status" aria-live="polite">
        {workflow.statusText}
      </DSTypography>
      <ol style={{ margin: 0, paddingInlineStart: "1.25rem" }}>
        {workflow.steps.map((step) => (
          <li
            key={step.id}
            aria-current={step.state === "active" ? "step" : undefined}
            style={{ marginBlock: "0.5rem" }}
          >
            <DSTypography size="textSm">{step.title}</DSTypography>
            {step.detail && (
              <DSTypography
                as="p"
                size="textXs"
                color={DSColor.typography.secondary}
              >
                {step.detail}
              </DSTypography>
            )}
            {step.explorerUrl && (
              <a
                href={step.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: DSColor.typography.brand }}
              >
                {t("view-transaction")}
              </a>
            )}
          </li>
        ))}
      </ol>
      {workflow.error && (
        <DSTypography as="p" size="textSm" role="alert">
          {workflow.error}
        </DSTypography>
      )}
      <DSTypography as="p" size="textXs" color={DSColor.typography.secondary}>
        {t("recovery-help")}
      </DSTypography>
      <Button
        text={t("check-status")}
        mode="ghost"
        disabled={workflow.checking}
        isLoading={workflow.checking}
        onClick={onRefresh}
      />
    </Panel>
  );
}

const DirectionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  min-width: 2.75rem;
  min-height: 2.75rem;
  margin-block: -0.5rem;
  padding: 0.25rem;
  border: 1px solid ${DSColor.stroke.input.default};
  border-radius: 50%;
  color: ${DSColor.typography.brand};
  background: ${DSColor.background.surface.surface};
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${DSColor.typography.brand};
    outline-offset: 2px;
  }
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid ${DSColor.stroke.separator.primary};
  border-radius: 0.75rem;
  background: ${DSColor.background.surface.surface};
`;
const SettingsPanel = styled.details`
  min-width: 0;
  padding: 0.5rem 1rem;
  border: 1px solid ${DSColor.stroke.separator.primary};
  border-radius: 0.75rem;
  background: ${DSColor.background.surface.surface};
  &[open] > summary > svg {
    transform: rotate(180deg);
  }
`;
const SettingsSummary = styled.summary`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  cursor: pointer;
  list-style: none;
  &::-webkit-details-marker {
    display: none;
  }
  > svg {
    flex-shrink: 0;
    color: ${DSColor.typography.secondary};
  }
  &:focus-visible {
    outline: 2px solid ${DSColor.typography.brand};
    outline-offset: 2px;
    border-radius: 0.25rem;
  }
`;
const SettingsContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-block: 0.75rem 0.5rem;
`;
const Select = styled.select`
  display: block;
  width: 100%;
  min-width: 0;
  margin-top: 0.375rem;
  padding: 0.5rem;
  border: 1px solid ${DSColor.stroke.input.default};
  border-radius: 0.375rem;
  color: ${DSColor.typography.primary};
  background: ${DSColor.background.surface.surface};
`;
const Progress = styled.progress`
  display: block;
  width: 100%;
  height: 0.4rem;
  accent-color: ${DSColor.typography.brand};
`;

const SwapContent = styled(Box)`
  h1,
  h2,
  p {
    margin: 0;
  }
`;
