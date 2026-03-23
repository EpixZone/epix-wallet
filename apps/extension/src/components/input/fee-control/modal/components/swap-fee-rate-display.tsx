import React, { FunctionComponent } from "react";
import { useIntl } from "react-intl";
import { useTheme } from "styled-components";
import { ColorPalette } from "../../../../../styles";
import { Subtitle4 } from "../../../../typography";
import { XAxis, YAxis } from "../../../../axis";
import { Tooltip } from "../../../../tooltip";
import { InformationOutlineIcon } from "../../../../icon";

export const SwapFeeRateDisplay: FunctionComponent<{
  swapAmountConfig?: {
    swapFeeBps: number;
  };
  swapFeeRate?: string;
}> = ({ swapAmountConfig, swapFeeRate }) => {
  const intl = useIntl();
  const theme = useTheme();

  if (!swapAmountConfig?.swapFeeBps) {
    return null;
  }

  return (
    <YAxis alignX="center">
      <XAxis alignY="center" gap="0.25rem">
        <Subtitle4
          color={
            theme.mode === "light"
              ? ColorPalette["gray-300"]
              : ColorPalette["gray-200"]
          }
        >
          {intl.formatMessage({
            id: "page.ibc-swap.components.swap-fee-info.button.service-fee",
          })}{" "}
          {swapFeeRate ? `${swapFeeRate}%` : ""}
        </Subtitle4>
        <Tooltip
          content={intl.formatMessage(
            {
              id:
                swapAmountConfig.swapFeeBps === 10
                  ? "page.ibc-swap.components.swap-fee-info.button.service-fee-stable-coin.paragraph"
                  : "page.ibc-swap.components.swap-fee-info.button.service-fee.paragraph",
            },
            {
              rate: swapFeeRate,
            }
          )}
        >
          <InformationOutlineIcon
            width="1rem"
            height="1rem"
            color={
              theme.mode === "light"
                ? ColorPalette["gray-200"]
                : ColorPalette["gray-300"]
            }
          />
        </Tooltip>
      </XAxis>
    </YAxis>
  );
};
