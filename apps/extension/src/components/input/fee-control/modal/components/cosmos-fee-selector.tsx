import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { useTheme } from "styled-components";
import { FormattedMessage } from "react-intl";
import { IFeeConfig } from "@keplr-wallet/hooks";
import { useStore } from "../../../../../stores";
import { ColorPalette } from "../../../../../styles";
import { Column, Columns } from "../../../../column";
import { Box } from "../../../../box";
import { FeeSelectorStyle } from "./fee-selector-styles";

export const CosmosFeeSelector: FunctionComponent<{
  feeConfig: IFeeConfig;
}> = observer(({ feeConfig }) => {
  const { priceStore } = useStore();
  const theme = useTheme();

  const feeCurrency =
    feeConfig.fees.length > 0
      ? feeConfig.fees[0].currency
      : feeConfig.selectableFeeCurrencies[0];

  if (!feeCurrency) {
    return null;
  }

  return (
    <Columns sum={3}>
      <Column weight={1}>
        <FeeSelectorStyle.Item
          style={{
            borderRadius: "0.5rem 0 0 0.5rem",
            borderRight: `1px solid ${
              theme.mode === "light"
                ? ColorPalette["gray-100"]
                : ColorPalette["gray-400"]
            }`,
          }}
          onClick={() => {
            feeConfig.setFee({
              type: "low",
              currency: feeCurrency,
            });
          }}
          selected={feeConfig.type === "low"}
        >
          {/* 텍스트의 길이 등에 의해서 레이아웃이 변하는걸 막기 위해서 가라로 1px의 너비르 가지는 Box로 감싸준다. */}
          <Box width="1px" alignX="center">
            <FeeSelectorStyle.Title selected={feeConfig.type === "low"}>
              <FormattedMessage id="components.input.fee-control.modal.fee-selector.low" />
            </FeeSelectorStyle.Title>
            {feeCurrency.coinGeckoId ? (
              <FeeSelectorStyle.Price selected={feeConfig.type === "low"}>
                {priceStore
                  .calculatePrice(
                    feeConfig.getFeeTypePrettyForFeeCurrency(feeCurrency, "low")
                  )
                  ?.toString() || "-"}
              </FeeSelectorStyle.Price>
            ) : null}
            <FeeSelectorStyle.Amount selected={feeConfig.type === "low"}>
              {feeConfig
                .getFeeTypePrettyForFeeCurrency(feeCurrency, "low")
                .maxDecimals(6)
                .inequalitySymbol(true)
                .trim(true)
                .shrink(true)
                .hideIBCMetadata(true)
                .toString()}
            </FeeSelectorStyle.Amount>
          </Box>
        </FeeSelectorStyle.Item>
      </Column>

      <Column weight={1}>
        <FeeSelectorStyle.Item
          onClick={() => {
            feeConfig.setFee({
              type: "average",
              currency: feeCurrency,
            });
          }}
          selected={feeConfig.type === "average"}
        >
          {/* 텍스트의 길이 등에 의해서 레이아웃이 변하는걸 막기 위해서 가라로 1px의 너비르 가지는 Box로 감싸준다. */}
          <Box width="1px" alignX="center">
            <FeeSelectorStyle.Title selected={feeConfig.type === "average"}>
              <FormattedMessage id="components.input.fee-control.modal.fee-selector.average" />
            </FeeSelectorStyle.Title>
            {feeCurrency.coinGeckoId ? (
              <FeeSelectorStyle.Price selected={feeConfig.type === "average"}>
                {priceStore
                  .calculatePrice(
                    feeConfig.getFeeTypePrettyForFeeCurrency(
                      feeCurrency,
                      "average"
                    )
                  )
                  ?.toString() || "-"}
              </FeeSelectorStyle.Price>
            ) : null}
            <FeeSelectorStyle.Amount selected={feeConfig.type === "average"}>
              {feeConfig
                .getFeeTypePrettyForFeeCurrency(feeCurrency, "average")
                .maxDecimals(6)
                .inequalitySymbol(true)
                .trim(true)
                .shrink(true)
                .hideIBCMetadata(true)
                .toString()}
            </FeeSelectorStyle.Amount>
          </Box>
        </FeeSelectorStyle.Item>
      </Column>

      <Column weight={1}>
        <FeeSelectorStyle.Item
          style={{
            borderRadius: "0 0.5rem 0.5rem 0",
            borderLeft: `1px solid ${
              theme.mode === "light"
                ? ColorPalette["gray-100"]
                : ColorPalette["gray-400"]
            }`,
          }}
          onClick={() => {
            feeConfig.setFee({
              type: "high",
              currency: feeCurrency,
            });
          }}
          selected={feeConfig.type === "high"}
        >
          {/* 텍스트의 길이 등에 의해서 레이아웃이 변하는걸 막기 위해서 가라로 1px의 너비르 가지는 Box로 감싸준다. */}
          <Box width="1px" alignX="center">
            <FeeSelectorStyle.Title selected={feeConfig.type === "high"}>
              <FormattedMessage id="components.input.fee-control.modal.fee-selector.high" />
            </FeeSelectorStyle.Title>
            {feeCurrency.coinGeckoId ? (
              <FeeSelectorStyle.Price selected={feeConfig.type === "high"}>
                {priceStore
                  .calculatePrice(
                    feeConfig.getFeeTypePrettyForFeeCurrency(
                      feeCurrency,
                      "high"
                    )
                  )
                  ?.toString() || "-"}
              </FeeSelectorStyle.Price>
            ) : null}
            <FeeSelectorStyle.Amount selected={feeConfig.type === "high"}>
              {feeConfig
                .getFeeTypePrettyForFeeCurrency(feeCurrency, "high")
                .maxDecimals(6)
                .inequalitySymbol(true)
                .trim(true)
                .shrink(true)
                .hideIBCMetadata(true)
                .toString()}
            </FeeSelectorStyle.Amount>
          </Box>
        </FeeSelectorStyle.Item>
      </Column>
    </Columns>
  );
});
