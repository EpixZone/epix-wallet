import {
  AppCurrency,
  ChainInfo,
  ERC20Currency,
  EvmChainInfo,
  ModularChainInfo,
} from "@keplr-wallet/types";
import { DenomHelper } from "@keplr-wallet/common";

function toERC20Currency(currency: AppCurrency): ERC20Currency {
  if (
    "type" in currency &&
    currency.type === "erc20" &&
    "contractAddress" in currency
  ) {
    return currency as ERC20Currency;
  }
  const denomHelper = new DenomHelper(currency.coinMinimalDenom);
  return {
    ...currency,
    type: "erc20" as const,
    contractAddress: denomHelper.contractAddress,
  };
}

export function convertChainInfoToModularChainInfo(
  chainInfo: ChainInfo
): ModularChainInfo {
  const common = {
    isV2: true as const,
    chainId: chainInfo.chainId,
    chainName: chainInfo.chainName,
    chainSymbolImageUrl: chainInfo.chainSymbolImageUrl,
    isTestnet: chainInfo.isTestnet,
    hideInUI: chainInfo.hideInUI,
  };

  if (chainInfo.evm) {
    const erc20Tokens: ERC20Currency[] = [];
    const nonERC20Currencies: AppCurrency[] = [];
    for (const currency of chainInfo.currencies) {
      const denomHelper = new DenomHelper(currency.coinMinimalDenom);
      if (denomHelper.type === "erc20") {
        erc20Tokens.push(toERC20Currency(currency));
      } else {
        nonERC20Currencies.push(currency);
      }
    }

    const nativeCurrency =
      nonERC20Currencies.find((cur) => {
        const dh = new DenomHelper(cur.coinMinimalDenom);
        return dh.type === "native";
      }) ?? nonERC20Currencies[0];

    if (!nativeCurrency) {
      throw new Error(
        `Chain ${chainInfo.chainId} has evm module but no non-ERC20 native currency`
      );
    }

    const evm: EvmChainInfo = {
      chainId: chainInfo.evm.chainId,
      rpc: chainInfo.evm.rpc,
      websocket: chainInfo.evm.websocket,
      nativeCurrency: nativeCurrency,
      tokens: erc20Tokens,
      features: chainInfo.features,
    };

    if (chainInfo.chainId.startsWith("eip155:")) {
      return { ...common, type: "evm", evm };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { evm: _, ...cosmosWithoutEvm } = chainInfo;
    return { ...common, type: "ethermint", cosmos: cosmosWithoutEvm, evm };
  }

  return { ...common, type: "cosmos" as const, cosmos: chainInfo };
}

/**
 * ModularChainInfo를 ChainInfo로 역변환한다.
 * cosmos, ethermint, evm 타입만 변환 가능. starknet/bitcoin은 undefined 반환.
 */
export function convertModularChainInfoToChainInfo(
  m: ModularChainInfo
): ChainInfo | undefined {
  if (m.type === "cosmos") {
    return m.cosmos as ChainInfo;
  }

  if (m.type === "ethermint") {
    return {
      ...m.cosmos,
      evm: {
        chainId: m.evm.chainId,
        rpc: m.evm.rpc,
        websocket: m.evm.websocket,
      },
    } as ChainInfo;
  }

  if (m.type === "evm") {
    return {
      rpc: m.evm.rpc,
      rest: m.evm.rpc,
      chainId: m.chainId,
      chainName: m.chainName,
      chainSymbolImageUrl: m.chainSymbolImageUrl,
      isTestnet: m.isTestnet,
      bip44: { coinType: 60 },
      currencies: [m.evm.nativeCurrency, ...m.evm.tokens],
      feeCurrencies: [m.evm.nativeCurrency],
      features: m.evm.features,
      evm: {
        chainId: m.evm.chainId,
        rpc: m.evm.rpc,
        websocket: m.evm.websocket,
      },
    };
  }

  return undefined;
}
