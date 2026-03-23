import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
  ISenderConfig,
} from "@keplr-wallet/hooks";
import { useTheme } from "styled-components";
import { ColorPalette } from "../../../../styles";
import { Body2 } from "../../../typography";
import { Modal } from "../../../modal";
import { TransactionFeeModal } from "../modal";
import { useStore } from "../../../../stores";
import { CoinPretty, Dec, PricePretty } from "@keplr-wallet/unit";
import { Box } from "../../../box";
import { FormattedMessage } from "react-intl";
import { XAxis, YAxis } from "../../../axis";
import {
  FeeControlErrorAndWarningView,
  FeeStatusIndicator,
} from "../components";
import { useInsufficientFeeAnalytics } from "../../../../hooks/analytics/use-insufficient-fee-analytics";
import {
  useFeeOptionSelectionOnInit,
  useAutoFeeCurrencySelectionOnInit,
} from "../../../../hooks/fee";

export const EVMFeeControl: FunctionComponent<{
  senderConfig: ISenderConfig;
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  gasSimulator?: IGasSimulator;
  disableAutomaticFeeSet?: boolean;
  nonceMethod?: "pending" | "latest";
  setNonceMethod?: (nonceMethod: "pending" | "latest") => void;
  isExternalMsg?: boolean;
  shouldTopUp?: boolean;
  forceTopUp?: boolean;
}> = observer(
  ({
    senderConfig,
    feeConfig,
    gasConfig,
    gasSimulator,
    disableAutomaticFeeSet,
    nonceMethod,
    setNonceMethod,
    isExternalMsg,
    shouldTopUp,
    forceTopUp,
  }) => {
    const {
      analyticsStore,
      queriesStore,
      priceStore,
      chainStore,
      uiConfigStore,
    } = useStore();

    useInsufficientFeeAnalytics(feeConfig, senderConfig, forceTopUp);

    const theme = useTheme();

    useFeeOptionSelectionOnInit(
      uiConfigStore,
      feeConfig,
      disableAutomaticFeeSet
    );

    useAutoFeeCurrencySelectionOnInit(
      chainStore,
      queriesStore,
      senderConfig,
      feeConfig,
      disableAutomaticFeeSet
    );

    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
      if (shouldTopUp) {
        setIsModalOpen(false);
      }
    }, [shouldTopUp]);

    // EVM 트랜잭션의 경우, 외부에서 fee를 설정한 경우를 구분하기 위해서 사용
    const isFeeSetByUser = feeConfig.type !== "manual";

    // gasAdjustment와 gasEstimated를 사용해 계산된 값을 보여주는 경우
    const isShowingFeeWithGasEstimated =
      !!gasSimulator?.enabled && !!gasSimulator?.gasEstimated && isFeeSetByUser;

    return (
      <Box>
        <YAxis alignX="center">
          <Box
            paddingBottom="0.21rem"
            cursor="pointer"
            onClick={(e) => {
              e.preventDefault();
              analyticsStore.logEvent("click_txFeeSet");
              setIsModalOpen(true);
            }}
          >
            <XAxis alignY="center">
              <Box minWidth="0.875rem" />
              <Body2
                color={(() => {
                  if (
                    feeConfig.uiProperties.error ||
                    feeConfig.uiProperties.warning
                  ) {
                    return theme.mode === "light"
                      ? ColorPalette["orange-400"]
                      : ColorPalette["yellow-400"];
                  }

                  return theme.mode === "light"
                    ? ColorPalette["blue-400"]
                    : ColorPalette["white"];
                })()}
                style={{
                  textDecoration: "underline",
                  textUnderlineOffset: "0.2rem",
                }}
              >
                {
                  <FormattedMessage
                    id="components.input.fee-control.fee"
                    values={{
                      assets: (() => {
                        if (feeConfig.fees.length > 0) {
                          return feeConfig.fees;
                        }
                        const mcFee = chainStore.getModularChain(
                          feeConfig.chainId
                        );
                        const uFee = mcFee.unwrapped;
                        const fallbackCurrency = (() => {
                          if (
                            uFee.type === "cosmos" ||
                            uFee.type === "ethermint"
                          ) {
                            return (
                              uFee.cosmos.stakeCurrency ||
                              uFee.cosmos.currencies[0]
                            );
                          }
                          if (uFee.type === "evm") {
                            return uFee.evm.nativeCurrency;
                          }
                          if (uFee.type === "starknet") {
                            return uFee.starknet.currencies[0];
                          }
                          if (uFee.type === "bitcoin") {
                            return uFee.bitcoin.currencies[0];
                          }
                          throw new Error("Unknown chain type");
                        })();
                        return [new CoinPretty(fallbackCurrency, new Dec(0))];
                      })()
                        .map((fee) =>
                          fee
                            .sub(
                              new Dec(feeConfig.l1DataFee?.toString() || "0")
                            )
                            .quo(
                              new Dec(
                                isShowingFeeWithGasEstimated
                                  ? gasConfig?.gas || 1
                                  : 1
                              )
                            )
                            .mul(
                              new Dec(
                                isShowingFeeWithGasEstimated
                                  ? gasSimulator?.gasEstimated || 1
                                  : 1
                              )
                            )
                            .mul(
                              new Dec(
                                isShowingFeeWithGasEstimated
                                  ? gasSimulator?.gasAdjustment || 1
                                  : 1
                              )
                            )
                            .add(
                              new Dec(feeConfig.l1DataFee?.toString() || "0")
                            )
                            .add(
                              isFeeSetByUser
                                ? new Dec(0)
                                : new Dec(
                                    feeConfig.l1DataFee?.toString() || "0"
                                  )
                            )
                            .maxDecimals(6)
                            .inequalitySymbol(true)
                            .trim(true)
                            .shrink(true)
                            .hideIBCMetadata(true)
                            .toString()
                        )
                        .join("+"),
                    }}
                  />
                }
              </Body2>
              <Body2
                color={
                  theme.mode === "light"
                    ? ColorPalette["gray-300"]
                    : ColorPalette["gray-300"]
                }
                style={{
                  textDecoration: "underline",
                  whiteSpace: "pre-wrap",
                  textUnderlineOffset: "0.2rem",
                }}
              >
                {` ${(() => {
                  let total: PricePretty | undefined;
                  let hasUnknown = false;
                  for (const fee of feeConfig.fees) {
                    if (!fee.currency.coinGeckoId) {
                      hasUnknown = true;
                      break;
                    } else {
                      const price = priceStore.calculatePrice(
                        fee
                          .sub(new Dec(feeConfig.l1DataFee?.toString() || "0"))
                          .quo(
                            new Dec(
                              isShowingFeeWithGasEstimated
                                ? gasConfig?.gas || 1
                                : 1
                            )
                          )
                          .mul(
                            new Dec(
                              isShowingFeeWithGasEstimated
                                ? gasSimulator?.gasEstimated || 1
                                : 1
                            )
                          )
                          .mul(
                            new Dec(
                              isShowingFeeWithGasEstimated
                                ? gasSimulator?.gasAdjustment || 1
                                : 1
                            )
                          )
                          .add(new Dec(feeConfig.l1DataFee?.toString() || "0"))
                          .add(
                            isFeeSetByUser
                              ? new Dec(0)
                              : new Dec(feeConfig.l1DataFee?.toString() || "0")
                          )
                      );
                      if (price) {
                        if (!total) {
                          total = price;
                        } else {
                          total = total.add(price);
                        }
                      }
                    }
                  }

                  if (hasUnknown || !total) {
                    return "";
                  }
                  return `(${total.toString()})`;
                })()}`}
              </Body2>
              <Box minWidth="0.875rem" height="1px" alignY="center">
                <FeeStatusIndicator
                  feeConfig={feeConfig}
                  gasSimulator={gasSimulator}
                  disableAutomaticFeeSet={disableAutomaticFeeSet}
                  uiConfigStore={uiConfigStore}
                />
              </Box>
            </XAxis>
          </Box>
        </YAxis>
        <FeeControlErrorAndWarningView
          feeConfig={feeConfig}
          gasConfig={gasConfig}
        />

        <Modal
          isOpen={isModalOpen}
          align="bottom"
          maxHeight="95vh"
          close={() => setIsModalOpen(false)}
        >
          <TransactionFeeModal
            close={() => setIsModalOpen(false)}
            senderConfig={senderConfig}
            feeConfig={feeConfig}
            gasConfig={gasConfig}
            gasSimulator={gasSimulator}
            disableAutomaticFeeSet={disableAutomaticFeeSet}
            isExternalMsg={isExternalMsg}
            isForEVMTx={true}
            nonceMethod={nonceMethod}
            setNonceMethod={setNonceMethod}
          />
        </Modal>
      </Box>
    );
  }
);
