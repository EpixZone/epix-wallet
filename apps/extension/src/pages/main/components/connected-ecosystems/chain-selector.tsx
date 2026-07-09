import React, { FunctionComponent, useEffect, useRef } from "react";
import { useTheme } from "styled-components";
import { IModularChainInfoImpl } from "@keplr-wallet/stores";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import {
  UpdateCurrentChainIdForBitcoinMsg,
  UpdateCurrentChainIdForStarknetMsg,
  UpdateCurrentChainIdForEVMMsg,
} from "@keplr-wallet/background";
import { Box } from "../../../../components/box";
import { Columns } from "../../../../components/column";
import { CheckIcon } from "../../../../components/icon";
import { ChainImageFallback } from "../../../../components/image";
import { Subtitle3 } from "../../../../components/typography";
import { ColorPalette } from "../../../../styles";

export const ChainSelector: FunctionComponent<{
  chainInfos: IModularChainInfoImpl[];
  currentChainId: string;
  setCurrentChainId: (chainId: string) => void;
  invalidateCurrentChainSync: () => void;
  activeTabOrigin: string;
  updateMessage:
    | typeof UpdateCurrentChainIdForBitcoinMsg
    | typeof UpdateCurrentChainIdForStarknetMsg
    | typeof UpdateCurrentChainIdForEVMMsg;

  // Ecosystem-specific options (e.g. Bitcoin uses baseChainId as identifier)
  getChainId?: (chainInfo: IModularChainInfoImpl) => string;
  isChainSelected?: (
    chainInfo: IModularChainInfoImpl,
    currentChainId: string
  ) => boolean;
}> = ({
  chainInfos,
  currentChainId,
  setCurrentChainId,
  invalidateCurrentChainSync,
  activeTabOrigin,
  updateMessage,
  getChainId,
  isChainSelected,
}) => {
  const theme = useTheme();
  const selectedChainRef = useRef<HTMLDivElement>(null);
  const prevCurrentChainIdRef = useRef(currentChainId);

  useEffect(() => {
    if (
      prevCurrentChainIdRef.current !== currentChainId &&
      selectedChainRef.current
    ) {
      selectedChainRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

    prevCurrentChainIdRef.current = currentChainId;
  }, [currentChainId]);

  return (
    <React.Fragment>
      {chainInfos.map((chainInfo) => {
        const chainId = getChainId ? getChainId(chainInfo) : chainInfo.chainId;
        const isSelected = isChainSelected
          ? isChainSelected(chainInfo, currentChainId)
          : currentChainId === chainInfo.chainId;

        return (
          <div key={chainId} ref={isSelected ? selectedChainRef : undefined}>
            <Box
              paddingX="1rem"
              paddingY="0.75rem"
              cursor="pointer"
              backgroundColor={
                theme.mode === "light"
                  ? ColorPalette["white"]
                  : ColorPalette["gray-650"]
              }
              hover={{
                backgroundColor:
                  theme.mode === "light"
                    ? ColorPalette["gray-50"]
                    : ColorPalette["gray-600"],
              }}
              onClick={async () => {
                const msg = new updateMessage(activeTabOrigin, chainId);
                await new InExtensionMessageRequester().sendMessage(
                  BACKGROUND_PORT,
                  msg
                );
                invalidateCurrentChainSync();
                setCurrentChainId(chainId);
              }}
            >
              <Columns sum={1} alignY="center" gutter="0.5rem">
                <ChainImageFallback chainInfo={chainInfo} size="2rem" />
                <Subtitle3
                  color={
                    theme.mode === "light"
                      ? ColorPalette["gray-700"]
                      : ColorPalette["white"]
                  }
                >
                  {chainInfo.chainName}
                </Subtitle3>
                <div style={{ flex: 1 }} />
                {isSelected && (
                  <CheckIcon
                    width="1.25rem"
                    height="1.25rem"
                    color={
                      theme.mode === "light"
                        ? ColorPalette["purple-400"]
                        : ColorPalette["gray-200"]
                    }
                  />
                )}
              </Columns>
            </Box>
          </div>
        );
      })}
    </React.Fragment>
  );
};
