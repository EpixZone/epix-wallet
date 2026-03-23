import React, { FunctionComponent, useMemo } from "react";
import { Box } from "../../../components/box";
import { XAxis, YAxis } from "../../../components/axis";
import { ColorPalette } from "../../../styles";
import { observer } from "mobx-react-lite";
import { Subtitle3, Subtitle4 } from "../../../components/typography";
import { MsgHistory } from "../../main/token-detail/types";
import { Tooltip } from "../../../components/tooltip";
import { useStore } from "../../../stores";
import { useTheme } from "styled-components";

export const HistoryDetailEvmContractCall: FunctionComponent<{
  msg: MsgHistory;
  targetDenom: string;
}> = observer(({ msg }) => {
  const { queriesStore } = useStore();

  const theme = useTheme();

  const queries = queriesStore.get(msg.chainId);
  const receiptQuery =
    queries.ethereum?.queryEthereumTxReceipt.getQueryByTxHash(
      `0x${msg.txHash}`
    );

  const contractAddress = useMemo(() => {
    if (msg.meta && typeof msg.meta === "object" && "contract" in msg.meta) {
      return (msg.meta as any).contract;
    }
    if (receiptQuery?.to) {
      return receiptQuery.to;
    }
    return "Unknown";
  }, [msg.meta, receiptQuery?.to]);

  const shortenedContractAddress = useMemo(() => {
    if (contractAddress === "Unknown") return "Unknown";
    try {
      return `${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}`;
    } catch (e) {
      console.log(e);
      return "Unknown";
    }
  }, [contractAddress]);

  return (
    <Box>
      <YAxis alignX="center">
        {/* Contract Address Info */}
        <Box
          width="100%"
          padding="1rem"
          borderRadius="0.375rem"
          backgroundColor={
            theme.mode === "light"
              ? ColorPalette["white"]
              : ColorPalette["gray-650"]
          }
          style={{
            boxShadow:
              theme.mode === "light"
                ? "0 1px 4px 0 rgba(43, 39, 55, 0.10)"
                : undefined,
          }}
        >
          <XAxis alignY="center">
            <Subtitle4
              color={
                theme.mode === "light"
                  ? ColorPalette["gray-300"]
                  : ColorPalette["gray-200"]
              }
            >
              Contract Address
            </Subtitle4>
            <div style={{ flex: 1 }} />
            <Tooltip
              content={contractAddress}
              allowedPlacements={["top", "left"]}
              hoverCloseInteractive={true}
            >
              <Subtitle3
                color={
                  theme.mode === "light"
                    ? ColorPalette["gray-700"]
                    : ColorPalette["white"]
                }
              >
                {shortenedContractAddress}
              </Subtitle3>
            </Tooltip>
          </XAxis>
        </Box>
      </YAxis>
    </Box>
  );
});

export const HistoryDetailEvmContractCallIcon: FunctionComponent = () => {
  const theme = useTheme();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="40"
      height="40"
      fill="none"
      viewBox="0 0 40 40"
    >
      <rect
        x="10"
        y="8"
        width="20"
        height="24"
        rx="2"
        stroke={
          theme.mode === "light"
            ? ColorPalette["gray-300"]
            : ColorPalette["gray-200"]
        }
        strokeWidth="2.5"
        fill="none"
      />
      <path
        stroke={
          theme.mode === "light"
            ? ColorPalette["gray-300"]
            : ColorPalette["gray-200"]
        }
        strokeWidth="2.5"
        strokeLinecap="round"
        d="M14 16h12M14 20h12M14 24h8"
      />
    </svg>
  );
};
