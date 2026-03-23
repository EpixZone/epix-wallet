import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { IFeeConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { useTheme } from "styled-components";
import { ColorPalette } from "../../../../styles";
import { LoadingIcon } from "../../../icon";
import { Box } from "../../../box";
import { Tooltip } from "../../../tooltip";
import { useIntl } from "react-intl";
import { UIConfigStore } from "../../../../stores/ui-config";

export const FeeStatusIndicator: FunctionComponent<{
  feeConfig: IFeeConfig;
  gasSimulator?: IGasSimulator;
  disableAutomaticFeeSet?: boolean;
  uiConfigStore: UIConfigStore;
}> = observer(
  ({ feeConfig, gasSimulator, disableAutomaticFeeSet, uiConfigStore }) => {
    const intl = useIntl();
    const theme = useTheme();

    if (
      feeConfig.uiProperties.loadingState ||
      gasSimulator?.uiProperties.loadingState
    ) {
      return (
        <Box alignY="center" marginLeft="0.25rem">
          <LoadingIcon
            width="1.25rem"
            height="1.25rem"
            color={ColorPalette["gray-200"]}
          />
        </Box>
      );
    }

    if (!disableAutomaticFeeSet && uiConfigStore.rememberLastFeeOption) {
      return (
        <Box minWidth="0.875rem" alignY="center" alignX="center">
          <div
            style={{
              width: "0.375rem",
              height: "0.375rem",
              borderRadius: "99999px",
              backgroundColor:
                theme.mode === "light"
                  ? ColorPalette["blue-400"]
                  : ColorPalette["blue-400"],
            }}
          />
        </Box>
      );
    }

    if (disableAutomaticFeeSet) {
      return (
        <Tooltip
          content={intl.formatMessage({
            id: "components.input.fee-control.tooltip.external-fee-set",
          })}
        >
          <Box alignY="center" marginLeft="0.25rem">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="17"
              height="17"
              fill="none"
              viewBox="0 0 17 17"
            >
              <path
                fill={
                  theme.mode === "light"
                    ? ColorPalette["gray-200"]
                    : ColorPalette["gray-300"]
                }
                d="M8.5 1.833A6.67 6.67 0 001.833 8.5 6.67 6.67 0 008.5 15.167 6.67 6.67 0 0015.167 8.5 6.67 6.67 0 008.5 1.833zm.667 10H7.834v-4h1.333v4zm0-5.333H7.834V5.167h1.333V6.5z"
              />
            </svg>
          </Box>
        </Tooltip>
      );
    }

    return null;
  }
);
