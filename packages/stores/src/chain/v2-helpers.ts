import {
  ChainInfo,
  CosmosChainInfo,
  FeeCurrency,
  ModularChainInfo,
} from "@keplr-wallet/types";
import { IModularChainInfoImpl } from "./modular";

export function getCosmosInfo(
  mcInfo2: IModularChainInfoImpl
): CosmosChainInfo | undefined {
  const u = mcInfo2.unwrapped;
  if (u.type === "cosmos" || u.type === "ethermint") {
    return u.cosmos;
  }
  return undefined;
}

export function requireCosmosInfo(
  mcInfo2: IModularChainInfoImpl
): CosmosChainInfo {
  const result = getCosmosInfo(mcInfo2);
  if (!result) {
    throw new Error(`Chain ${mcInfo2.chainId} does not have cosmos module`);
  }
  return result;
}

/**
 * ModularChainInfo (cosmos/ethermint/evm) → v1 ChainInfo 변환.
 * experimentalSuggestChain 등 v1 ChainInfo를 요구하는 API에 사용.
 */
export function modularChainInfoToChainInfo(info: ModularChainInfo): ChainInfo {
  if (info.type === "cosmos") {
    return {
      ...info.cosmos,
      hideInUI: info.hideInUI,
    };
  }
  if (info.type === "ethermint") {
    return {
      ...info.cosmos,
      hideInUI: info.hideInUI,
      evm: {
        chainId: info.evm.chainId,
        rpc: info.evm.rpc,
        websocket: info.evm.websocket,
      },
    };
  }
  if (info.type === "evm") {
    return {
      chainId: info.chainId,
      chainName: info.chainName,
      chainSymbolImageUrl: info.chainSymbolImageUrl,
      hideInUI: info.hideInUI,
      isTestnet: info.isTestnet,
      rpc: info.evm.rpc,
      rest: info.evm.rpc,
      bip44: { coinType: 60 },
      currencies: [info.evm.nativeCurrency, ...info.evm.tokens],
      feeCurrencies: [info.evm.nativeCurrency as FeeCurrency],
      features: info.evm.features,
      evm: {
        chainId: info.evm.chainId,
        rpc: info.evm.rpc,
        websocket: info.evm.websocket,
      },
    };
  }
  throw new Error(
    `Cannot convert chain type "${info.type}" to ChainInfo (starknet/bitcoin not supported)`
  );
}
