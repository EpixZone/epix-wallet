import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import {
  IFeeConfig,
  IGasConfig,
  InsufficientFeeError,
} from "@keplr-wallet/hooks";
import { InsufficientFeeError as EvmInsufficientFeeError } from "@keplr-wallet/hooks-evm";
import { useTheme } from "styled-components";
import { ColorPalette } from "../../../../styles";
import { Subtitle4 } from "../../../typography";
import { Box } from "../../../box";
import { VerticalResizeTransition } from "../../../transition";
import { useIntl } from "react-intl";

export const FeeControlErrorAndWarningView: FunctionComponent<{
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
}> = observer(({ feeConfig, gasConfig }) => {
  const intl = useIntl();
  const theme = useTheme();

  return (
    <VerticalResizeTransition transitionAlign="top">
      {feeConfig.uiProperties.error || feeConfig.uiProperties.warning ? (
        <Box
          marginTop="1.04rem"
          borderRadius="0.5rem"
          alignX="center"
          alignY="center"
          paddingY="1.125rem"
          backgroundColor={
            theme.mode === "light"
              ? ColorPalette["orange-50"]
              : ColorPalette["yellow-800"]
          }
        >
          <Subtitle4
            color={
              theme.mode === "light"
                ? ColorPalette["orange-400"]
                : ColorPalette["yellow-400"]
            }
          >
            {(() => {
              if (feeConfig.uiProperties.error) {
                if (
                  feeConfig.uiProperties.error instanceof
                    InsufficientFeeError ||
                  feeConfig.uiProperties.error instanceof
                    EvmInsufficientFeeError
                ) {
                  return intl.formatMessage({
                    id: "components.input.fee-control.error.insufficient-fee",
                  });
                }

                return (
                  feeConfig.uiProperties.error.message ||
                  feeConfig.uiProperties.error.toString()
                );
              }

              if (feeConfig.uiProperties.warning) {
                return (
                  feeConfig.uiProperties.warning.message ||
                  feeConfig.uiProperties.warning.toString()
                );
              }

              if (gasConfig.uiProperties.error) {
                return (
                  gasConfig.uiProperties.error.message ||
                  gasConfig.uiProperties.error.toString()
                );
              }

              if (gasConfig.uiProperties.warning) {
                return (
                  gasConfig.uiProperties.warning.message ||
                  gasConfig.uiProperties.warning.toString()
                );
              }
            })()}
          </Subtitle4>
        </Box>
      ) : null}
    </VerticalResizeTransition>
  );
});
