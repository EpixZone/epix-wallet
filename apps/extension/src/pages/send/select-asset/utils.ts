import { DenomHelper } from "@keplr-wallet/common";

type IBCTransferSelectableChainInfo = {
  unwrapped: {
    type: string;
    cosmos?: {
      features?: string[];
    };
  };
};

export function canSelectAssetForIBCTransfer(
  chainInfo: IBCTransferSelectableChainInfo,
  coinMinimalDenom: string
): boolean {
  const u = chainInfo.unwrapped;
  if (u.type !== "cosmos" && u.type !== "ethermint") {
    return false;
  }

  if (!(u.cosmos?.features?.includes("ibc-transfer") ?? false)) {
    return false;
  }

  return new DenomHelper(coinMinimalDenom).type === "native";
}
