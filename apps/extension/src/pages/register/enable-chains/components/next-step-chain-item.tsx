import React, { FunctionComponent } from "react";
import { IModularChainInfoImpl } from "@keplr-wallet/stores";
import { ChainInfo } from "@keplr-wallet/types";
import { Box } from "../../../../components/box";
import { Columns } from "../../../../components/column";
import { XAxis, YAxis } from "../../../../components/axis";
import { ChainImageFallback } from "../../../../components/image";
import { Gutter } from "../../../../components/gutter";
import { Subtitle2, Subtitle4 } from "../../../../components/typography";
import { Tag } from "../../../../components/tag";
import { ColorPalette } from "../../../../styles";
import { FormattedMessage } from "react-intl";

export const NextStepChainItem: FunctionComponent<{
  modularChainInfo: IModularChainInfoImpl | ChainInfo;
  tagText: string;
}> = ({ modularChainInfo, tagText }) => {
  const chainType = (() => {
    if ("type" in modularChainInfo) {
      return modularChainInfo.type;
    }
    // ChainInfo from external API — always cosmos/ethermint-like
    return "cosmos";
  })();

  return (
    <Box
      paddingX="1rem"
      paddingY="0.75rem"
      cursor="not-allowed"
      style={{ opacity: 0.5 }}
    >
      <Columns sum={1}>
        <XAxis alignY="center">
          <ChainImageFallback chainInfo={modularChainInfo} size="3rem" />

          <Gutter size="0.5rem" />

          <YAxis>
            <XAxis alignY="center">
              <Subtitle2>{modularChainInfo.chainName}</Subtitle2>

              <Gutter size="0.375rem" />

              <Tag text={tagText} />
            </XAxis>

            <Gutter size="0.25rem" />

            <Subtitle4 color={ColorPalette["gray-300"]}>
              {chainType === "bitcoin" ? (
                <FormattedMessage id="pages.register.enable-chains.guide.can-select-bitcoin-later-step" />
              ) : chainType === "starknet" ? (
                <FormattedMessage id="pages.register.enable-chains.guide.can-select-starknet-later-step" />
              ) : (
                <FormattedMessage id="pages.register.enable-chains.guide.can-select-evm-next-step" />
              )}
            </Subtitle4>
          </YAxis>
        </XAxis>
      </Columns>
    </Box>
  );
};
