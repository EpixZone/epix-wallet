import { IModularChainInfoImpl } from "@keplr-wallet/stores";
import { ChainInfo } from "@keplr-wallet/types";
import { GroupedModularChainInfo } from "../stores/chain";

function isUnsupportedKeystoneChainId(chainId: string): boolean {
  return chainId.startsWith("starknet:") || chainId.startsWith("bip122:");
}

export function isChainSupportedByKeyType(
  keyType: string | undefined,
  chainInfo: IModularChainInfoImpl | ChainInfo
): boolean {
  if (keyType !== "keystone") {
    return true;
  }

  if ("type" in chainInfo) {
    return (
      chainInfo.type !== "starknet" &&
      chainInfo.type !== "bitcoin" &&
      !isUnsupportedKeystoneChainId(chainInfo.chainId)
    );
  }

  return !isUnsupportedKeystoneChainId(chainInfo.chainId);
}

export function filterModularChainInfosByKeyType(
  keyType: string | undefined,
  modularChainInfos: IModularChainInfoImpl[]
): IModularChainInfoImpl[] {
  return modularChainInfos.filter((modularChainInfo) =>
    isChainSupportedByKeyType(keyType, modularChainInfo)
  );
}

export function filterGroupedModularChainInfosByKeyType(
  keyType: string | undefined,
  groupedModularChainInfos: GroupedModularChainInfo[]
): GroupedModularChainInfo[] {
  return groupedModularChainInfos.filter((group) =>
    isChainSupportedByKeyType(keyType, group.modularChainInfo)
  );
}
