import { action, computed, makeObservable, observable } from "mobx";
import {
  AppCurrency,
  ChainInfo,
  ERC20Currency,
  EvmChainInfo,
  ModularChainInfo,
  isEthSignChain,
} from "@keplr-wallet/types";
import { IChainStore, CurrencyRegistrar } from "./types";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { DenomHelper } from "@keplr-wallet/common";
import { keepAlive } from "mobx-utils";
import { ModularChainInfoImpl } from "./modular";

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

function convertChainInfoToModularChainInfo(
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

export class ChainStore implements IChainStore {
  @observable.ref
  protected _modularChainInfos: ModularChainInfoImpl[] = [];

  @observable
  protected currencyRegistrars: CurrencyRegistrar[] = [];

  constructor(embedChainInfos: (ChainInfo | ModularChainInfo)[]) {
    makeObservable(this);

    this.setEmbeddedChainInfos(embedChainInfos);

    keepAlive(this, "modularChainInfoImplMap");
  }

  get modularChainInfos(): ModularChainInfoImpl[] {
    return this._modularChainInfos;
  }

  @computed
  protected get modularChainInfoImplMap(): Map<string, ModularChainInfoImpl> {
    const result: Map<string, ModularChainInfoImpl> = new Map();
    for (const chainInfo of this._modularChainInfos) {
      result.set(ChainIdHelper.parse(chainInfo.chainId).identifier, chainInfo);
    }
    return result;
  }

  getModularChain(chainId: string): ModularChainInfoImpl {
    const chainIdentifier = ChainIdHelper.parse(chainId);

    const modularChainInfoImpl = this.modularChainInfoImplMap.get(
      chainIdentifier.identifier
    );

    if (!modularChainInfoImpl) {
      throw new Error(`Unknown modular chain info: ${chainId}`);
    }

    return modularChainInfoImpl;
  }

  hasModularChain(chainId: string): boolean {
    const chainIdentifier = ChainIdHelper.parse(chainId);

    return this.modularChainInfoImplMap.has(chainIdentifier.identifier);
  }

  @action
  protected setEmbeddedChainInfos(
    chainInfos: (ChainInfo | ModularChainInfo)[]
  ) {
    this._modularChainInfos = chainInfos.map((chainInfo) => {
      const modularChainInfo: ModularChainInfo =
        "currencies" in chainInfo
          ? convertChainInfoToModularChainInfo(chainInfo)
          : (chainInfo as ModularChainInfo);

      const prev = this.modularChainInfoImplMap.get(
        ChainIdHelper.parse(chainInfo.chainId).identifier
      );
      if (prev) {
        prev.setEmbeddedModularChainInfo(modularChainInfo);
        return prev;
      }

      return new ModularChainInfoImpl(modularChainInfo, this);
    });
  }

  getCurrencyRegistrar(
    chainId: string,
    coinMinimalDenom: string
  ):
    | {
        value: AppCurrency | undefined;
        done: boolean;
      }
    | undefined {
    for (let i = 0; i < this.currencyRegistrars.length; i++) {
      const registrar = this.currencyRegistrars[i];
      const generator = registrar(chainId, coinMinimalDenom);
      if (generator) {
        return generator;
      }
    }
    return undefined;
  }

  @action
  registerCurrencyRegistrar(registrar: CurrencyRegistrar): void {
    this.currencyRegistrars.push(registrar);
  }

  isEvmChain(chainId: string): boolean {
    const mcInfo2 = this.getModularChain(chainId);
    return mcInfo2.type === "evm" || mcInfo2.type === "ethermint";
  }

  isEvmOnlyChain(chainId: string): boolean {
    const mcInfo2 = this.getModularChain(chainId);
    return mcInfo2.type === "evm";
  }

  isEvmOrEthermintLikeChain(chainId: string): boolean {
    const mcInfo2 = this.getModularChain(chainId);
    return isEthSignChain(mcInfo2.unwrapped);
  }
}
