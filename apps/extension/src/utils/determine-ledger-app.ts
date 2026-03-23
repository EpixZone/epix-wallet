import { IModularChainInfoImpl } from "@keplr-wallet/stores";
import { isEthSignChain } from "@keplr-wallet/types";

export const determineLedgerApp = (info: IModularChainInfoImpl): string => {
  const u = info.unwrapped;

  if (isEthSignChain(u)) {
    return "Ethereum";
  }

  if (u.type === "starknet") {
    return "Starknet";
  }
  if (u.type === "bitcoin") {
    const coinType = u.bitcoin.bip44.coinType;
    return coinType === 1 ? "Bitcoin Test" : "Bitcoin";
  }

  return "Cosmos";
};
