import React, { FunctionComponent } from "react";
import { Subtitle1, Subtitle3 } from "../../../typography";
import { ColorPalette } from "../../../../styles";
import { useTheme } from "styled-components";
import { Stack } from "../../../stack";
import { Dropdown } from "../../../dropdown";
import { Toggle } from "../../../toggle";
import { TextInput } from "../..";
import { Button } from "../../../button";
import { observer } from "mobx-react-lite";
import { Dec, IntPretty } from "@keplr-wallet/unit";
import { useStore } from "../../../../stores";
import { GuideBox } from "../../../guide-box";
import { Box } from "../../../box";
import { FormattedMessage, useIntl } from "react-intl";
import { XAxis } from "../../../axis";
import { Gutter } from "../../../gutter";
import { useEffectOnce } from "../../../../hooks/use-effect-once";
import { CosmosTransactionFeeModalProps } from "../../../../hooks/fee/types";
import {
  useGasSimulatorStatus,
  useChangesApplied,
  useRememberLastFeeOption,
} from "./hooks";
import {
  ModalContainer,
  ChangesAppliedNotification,
  GasSimulatorGuideError,
  GasSimulatorGuideWarning,
  SwapFeeRateDisplay,
  RememberFeeOptionToggle,
  CosmosFeeSelector,
} from "./components";

export const CosmosTransactionFeeModal: FunctionComponent<CosmosTransactionFeeModalProps> =
  observer(
    ({
      close,
      senderConfig,
      feeConfig,
      gasConfig,
      swapAmountConfig,
      gasSimulator,
      disableAutomaticFeeSet,
      isExternalMsg,
    }) => {
      const { queriesStore, uiConfigStore, analyticsAmplitudeStore } =
        useStore();
      const intl = useIntl();
      const theme = useTheme();

      const showExternalFeeSetGuide = isExternalMsg && disableAutomaticFeeSet;

      const showRememberLastFeeOptionToggle = !disableAutomaticFeeSet;

      const { isGasSimulatorUsable, isGasSimulatorEnabled } =
        useGasSimulatorStatus(gasSimulator);

      useRememberLastFeeOption(uiConfigStore, feeConfig);

      const showChangesApplied = useChangesApplied(
        feeConfig,
        gasConfig,
        isGasSimulatorEnabled
      );

      const swapFeeRate = swapAmountConfig
        ? new IntPretty(swapAmountConfig.swapFeeBps)
            .moveDecimalPointLeft(2)
            .trim(true)
            .maxDecimals(4)
            .inequalitySymbol(true)
            .toString()
        : undefined;

      useEffectOnce(() => {
        analyticsAmplitudeStore.logEvent("view_fee_modal");
      });

      return (
        <ModalContainer>
          <Box marginBottom="1.25rem" marginLeft="0.5rem" paddingY="0.4rem">
            <Subtitle1>
              <FormattedMessage id="components.input.fee-control.modal.title" />
            </Subtitle1>
          </Box>

          <Stack gutter="0.75rem">
            <Stack gutter="0.375rem">
              <Box marginLeft="0.5rem">
                <XAxis alignY="center">
                  <Subtitle3
                    color={
                      theme.mode === "light"
                        ? ColorPalette["gray-400"]
                        : ColorPalette["gray-100"]
                    }
                  >
                    <FormattedMessage id="components.input.fee-control.modal.fee-title" />
                  </Subtitle3>

                  <div style={{ flex: 1 }} />
                  {showRememberLastFeeOptionToggle ? (
                    <RememberFeeOptionToggle uiConfigStore={uiConfigStore} />
                  ) : null}
                </XAxis>
              </Box>

              <CosmosFeeSelector feeConfig={feeConfig} />
            </Stack>

            <Dropdown
              label={intl.formatMessage({
                id: "components.input.fee-control.modal.fee-token-dropdown-label",
              })}
              menuContainerMaxHeight="10rem"
              items={feeConfig.selectableFeeCurrencies
                .filter((cur, i) => {
                  if (i === 0) {
                    return true;
                  }

                  const balance = queriesStore
                    .get(feeConfig.chainId)
                    .queryBalances.getQueryBech32Address(senderConfig.sender)
                    .getBalanceFromCurrency(cur);

                  return balance.toDec().gt(new Dec(0));
                })
                .map((cur) => {
                  return {
                    key: cur.coinMinimalDenom,
                    label: cur.coinDenom,
                  };
                })}
              selectedItemKey={feeConfig.fees[0]?.currency.coinMinimalDenom}
              onSelect={(key) => {
                const currency = feeConfig.selectableFeeCurrencies.find(
                  (cur) => cur.coinMinimalDenom === key
                );
                if (currency) {
                  if (feeConfig.type !== "manual") {
                    feeConfig.setFee({
                      type: feeConfig.type,
                      currency: currency,
                    });
                  } else {
                    feeConfig.setFee({
                      type: "average",
                      currency: currency,
                    });
                  }
                }
              }}
              size="large"
            />

            {(() => {
              if (gasSimulator) {
                if (gasSimulator.uiProperties.error) {
                  return <GasSimulatorGuideError gasSimulator={gasSimulator} />;
                }

                if (gasSimulator.uiProperties.warning) {
                  return (
                    <GasSimulatorGuideWarning gasSimulator={gasSimulator} />
                  );
                }
              }
            })()}

            {isGasSimulatorEnabled ? (
              <TextInput
                label={intl.formatMessage({
                  id: "components.input.fee-control.modal.gas-adjustment-label",
                })}
                value={gasSimulator?.gasAdjustmentValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  e.preventDefault();

                  gasSimulator?.setGasAdjustmentValue(e.target.value);
                }}
                rightLabel={
                  isGasSimulatorUsable && gasSimulator ? (
                    <Box marginBottom="0.375rem">
                      <XAxis alignY="center">
                        <Subtitle3 color={ColorPalette["gray-200"]}>
                          <FormattedMessage id="components.input.fee-control.modal.auto-title" />
                        </Subtitle3>
                        <Gutter size="0.5rem" />
                        <Toggle
                          isOpen={gasSimulator.enabled}
                          setIsOpen={(isOpen) => {
                            gasSimulator?.setEnabled(isOpen);
                          }}
                        />
                      </XAxis>
                    </Box>
                  ) : null
                }
              />
            ) : (
              <TextInput
                label={intl.formatMessage({
                  id: "components.input.fee-control.modal.gas-amount-label",
                })}
                value={gasConfig.value}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  e.preventDefault();

                  gasConfig.setValue(e.target.value);
                }}
                rightLabel={
                  isGasSimulatorUsable && gasSimulator ? (
                    <Box marginBottom="0.375rem">
                      <XAxis alignY="center">
                        <Subtitle3 color={ColorPalette["gray-200"]}>
                          <FormattedMessage id="components.input.fee-control.modal.auto-title" />
                        </Subtitle3>
                        <Gutter size="0.5rem" />
                        <Toggle
                          isOpen={gasSimulator.enabled}
                          setIsOpen={(isOpen) => {
                            gasSimulator?.setEnabled(isOpen);
                          }}
                        />
                      </XAxis>
                    </Box>
                  ) : null
                }
              />
            )}

            {showExternalFeeSetGuide ? (
              <GuideBox
                title={intl.formatMessage({
                  id: "components.input.fee-control.modal.guide.external-fee-set",
                })}
                backgroundColor={
                  theme.mode === "light" ? undefined : ColorPalette["gray-500"]
                }
              />
            ) : null}

            <ChangesAppliedNotification
              showChangesApplied={showChangesApplied}
            />
            <Gutter size="0" />

            {swapAmountConfig?.swapFeeBps ? (
              <SwapFeeRateDisplay
                swapAmountConfig={swapAmountConfig}
                swapFeeRate={swapFeeRate}
              />
            ) : null}

            <Button
              type="button"
              text={intl.formatMessage({
                id: "button.close",
              })}
              color="secondary"
              size="large"
              onClick={() => {
                close();
              }}
            />
          </Stack>
        </ModalContainer>
      );
    }
  );
