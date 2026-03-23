import React, { FunctionComponent, useEffect, useState } from "react";
import { Body3, Subtitle1, Subtitle3 } from "../../../typography";
import { ColorPalette } from "../../../../styles";
import { useTheme } from "styled-components";
import { Stack } from "../../../stack";
import { Toggle } from "../../../toggle";
import { TextInput } from "../..";
import { Button } from "../../../button";
import { observer } from "mobx-react-lite";
import { Dec, IntPretty, PricePretty } from "@keplr-wallet/unit";
import { GWEI } from "@keplr-wallet/hooks-evm";
import { useStore } from "../../../../stores";
import { GuideBox } from "../../../guide-box";
import { Box } from "../../../box";
import { FormattedMessage, useIntl } from "react-intl";
import { XAxis, YAxis } from "../../../axis";
import { Gutter } from "../../../gutter";
import { useEffectOnce } from "../../../../hooks/use-effect-once";
import { getKeplrFromWindow } from "@keplr-wallet/stores";
import {
  useGasSimulatorStatus,
  useChangesApplied,
  useRememberLastFeeOption,
} from "./hooks";
import {
  ModalContainer,
  RememberFeeOptionToggle,
  EVMFeeSelector,
  GasSimulatorGuideError,
  GasSimulatorGuideWarning,
  ChangesAppliedNotification,
  SwapFeeRateDisplay,
} from "./components";
import { VerticalCollapseTransition } from "../../../transition/vertical-collapse";
import { EVMTransactionFeeModalProps } from "../../../../hooks/fee/types";

export const EVMTransactionFeeModal: FunctionComponent<EVMTransactionFeeModalProps> =
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
      nonceMethod,
      setNonceMethod,
    }) => {
      const { uiConfigStore, priceStore, analyticsAmplitudeStore } = useStore();
      const intl = useIntl();
      const theme = useTheme();
      const showExternalFeeSetGuide = isExternalMsg && disableAutomaticFeeSet;

      const showRememberLastFeeOptionToggle =
        !disableAutomaticFeeSet && feeConfig.type !== "custom";

      const { isGasSimulatorEnabled } = useGasSimulatorStatus(gasSimulator);

      useRememberLastFeeOption(uiConfigStore, feeConfig);

      const showChangesApplied = useChangesApplied(
        feeConfig,
        gasConfig,
        isGasSimulatorEnabled
      );

      const isShowingFeeWithGasEstimated =
        !!isGasSimulatorEnabled && !!gasSimulator?.gasEstimated;

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

      const [hasEVMPendingTx, setHasEVMPendingTx] = useState<boolean>(false);
      useEffect(() => {
        if (setNonceMethod) {
          (async () => {
            const keplr = await getKeplrFromWindow();
            if (keplr) {
              const transactionCountPending =
                await keplr.ethereum.request<string>({
                  method: "eth_getTransactionCount",
                  params: [senderConfig.sender, "pending"],
                  chainId: feeConfig.chainId,
                });
              const transactionCountLastest =
                await keplr.ethereum.request<string>({
                  method: "eth_getTransactionCount",
                  params: [senderConfig.sender, "latest"],
                  chainId: feeConfig.chainId,
                });
              if (
                transactionCountPending &&
                transactionCountLastest &&
                transactionCountPending !== transactionCountLastest
              ) {
                setHasEVMPendingTx(true);
              } else {
                setHasEVMPendingTx(false);
              }
            }
          })();
        } else {
          setHasEVMPendingTx(false);
        }
      }, [feeConfig.chainId, senderConfig.sender, setNonceMethod]);

      return (
        <ModalContainer>
          <Box marginBottom="1.25rem" marginLeft="0.5rem" paddingY="0.4rem">
            <Subtitle1>
              <FormattedMessage id="components.input.fee-control.modal.title" />
            </Subtitle1>
          </Box>

          {setNonceMethod != null && hasEVMPendingTx ? (
            <Box
              marginBottom="1.25rem"
              paddingX="0.75rem"
              paddingY="1rem"
              borderRadius="0.375rem"
              backgroundColor={
                theme.mode === "light"
                  ? ColorPalette["gray-50"]
                  : ColorPalette["gray-500"]
              }
            >
              <XAxis alignY="center">
                <YAxis>
                  <Subtitle3
                    color={
                      theme.mode === "light"
                        ? ColorPalette["gray-700"]
                        : ColorPalette["gray-10"]
                    }
                  >
                    <FormattedMessage id="components.input.fee-control.modal.replace-pending-tx" />
                  </Subtitle3>
                  <Gutter size="0.37rem" />
                  <Subtitle3
                    color={
                      theme.mode === "light"
                        ? ColorPalette["gray-300"]
                        : ColorPalette["gray-300"]
                    }
                  >
                    <FormattedMessage id="components.input.fee-control.modal.replace-pending-tx.paragraph" />
                  </Subtitle3>
                </YAxis>

                <div style={{ flexShrink: 0 }}>
                  <Toggle
                    isOpen={nonceMethod === "latest"}
                    setIsOpen={(isOpen) => {
                      if (isOpen) {
                        setNonceMethod("latest");
                      } else {
                        setNonceMethod("pending");
                      }
                    }}
                  />
                </div>
              </XAxis>
            </Box>
          ) : null}

          <Stack gutter="0.5rem">
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
                  ) : (
                    <div style={{ height: "2rem" }} />
                  )}
                </XAxis>
              </Box>

              <EVMFeeSelector
                feeConfig={feeConfig}
                gasConfig={gasConfig}
                gasSimulator={gasSimulator}
                isShowingFeeWithGasEstimated={isShowingFeeWithGasEstimated}
              />
            </Stack>

            <VerticalCollapseTransition collapsed={feeConfig.type !== "custom"}>
              <React.Fragment>
                <Gutter size="0.5rem" />
                <XAxis>
                  <Body3
                    color={
                      theme.mode === "light"
                        ? ColorPalette["gray-400"]
                        : ColorPalette["gray-100"]
                    }
                  >
                    <b>
                      <FormattedMessage id="components.input.fee-control.modal.max-fee" />
                    </b>
                    {`: ${(() => {
                      const fees = feeConfig.getEIP1559TxFees("custom");
                      const gasPrice =
                        fees.maxFeePerGas ?? fees.gasPrice ?? new Dec(0);
                      return `${gasPrice.quo(GWEI).toString(4)} GWEI`;
                    })()}`}
                  </Body3>
                  <Body3
                    color={
                      theme.mode === "light"
                        ? ColorPalette["gray-300"]
                        : ColorPalette["gray-300"]
                    }
                    style={{
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {` ${(() => {
                      let total: PricePretty | undefined;
                      let hasUnknown = false;
                      if (feeConfig.fees.length === 0) {
                        return "";
                      }
                      const maxFee = feeConfig.fees[0].sub(new Dec(0));
                      if (!maxFee.currency.coinGeckoId) {
                        hasUnknown = true;
                      } else {
                        const price = priceStore.calculatePrice(maxFee);
                        if (price) {
                          if (!total) {
                            total = price;
                          } else {
                            total = total.add(price);
                          }
                        }
                      }

                      if (hasUnknown || !total) {
                        return "";
                      }
                      return `(${total.toString()})`;
                    })()}`}
                  </Body3>
                </XAxis>
                <Gutter size="0.75rem" />

                <Box>
                  {feeConfig.isLegacyFeeMode ? (
                    <TextInput
                      label={intl.formatMessage({
                        id: "components.input.fee-control.modal.gas-price-label",
                      })}
                      value={feeConfig.customGasPriceInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        e.preventDefault();
                        feeConfig.setCustomGasPrice(e.target.value);
                      }}
                      placeholder="0"
                      right={
                        <Subtitle3
                          color={
                            theme.mode === "light"
                              ? ColorPalette["gray-300"]
                              : ColorPalette["gray-300"]
                          }
                        >
                          GWEI
                        </Subtitle3>
                      }
                    />
                  ) : (
                    <TextInput
                      label={intl.formatMessage({
                        id: "components.input.fee-control.modal.priority-fee-label",
                      })}
                      value={feeConfig.customPriorityFeeInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        e.preventDefault();
                        feeConfig.setCustomPriorityFee(e.target.value);
                      }}
                      placeholder="0"
                      right={
                        <Subtitle3
                          color={
                            theme.mode === "light"
                              ? ColorPalette["gray-300"]
                              : ColorPalette["gray-300"]
                          }
                        >
                          GWEI
                        </Subtitle3>
                      }
                    />
                  )}
                </Box>
              </React.Fragment>
            </VerticalCollapseTransition>

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
