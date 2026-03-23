import { Currency, AppCurrency, FeeCurrency, ERC20Currency } from "./currency";
import { BIP44 } from "./bip44";
import { Bech32Config } from "./bech32";
import { EVMInfo } from "./ethereum";

export interface ChainInfo {
  readonly rpc: string;
  readonly rest: string;
  readonly nodeProvider?: {
    readonly name: string;
    readonly email?: string;
    readonly discord?: string;
    readonly website?: string;
  };
  readonly chainId: string;
  readonly chainName: string;
  /**
   * This indicates the type of coin that can be used for stake.
   * You can get actual currency information from Currencies.
   */
  readonly stakeCurrency?: Currency;
  readonly walletUrl?: string;
  readonly walletUrlForStaking?: string;
  readonly bip44: BIP44;
  readonly alternativeBIP44s?: BIP44[];
  readonly bech32Config?: Bech32Config;

  readonly currencies: AppCurrency[];
  /**
   * This indicates which coin or token can be used for fee to send transaction.
   * You can get actual currency information from Currencies.
   */
  readonly feeCurrencies: FeeCurrency[];

  /**
   * Indicate the features supported by this chain. Ex) cosmwasm, secretwasm ...
   */
  readonly features?: string[];

  /**
   * Shows whether the blockchain is in production phase or beta phase.
   * Major features such as staking and sending are supported on staging blockchains, but without guarantee.
   * If the blockchain is in an early stage, please set it as beta.
   */
  readonly beta?: boolean;

  readonly chainSymbolImageUrl?: string;

  readonly hideInUI?: boolean;

  readonly evm?: EVMInfo;

  readonly isTestnet?: boolean;

  readonly explorers?: {
    readonly txPage: string;
  };
}

export function isEthSignChainInfo(chainInfo: ChainInfo): boolean {
  return (
    !!chainInfo.evm ||
    chainInfo.bip44.coinType === 60 ||
    !!chainInfo.features?.includes("eth-address-gen") ||
    !!chainInfo.features?.includes("eth-key-sign")
  );
}

export type ChainInfoWithoutEndpoints = Omit<
  ChainInfo,
  "rest" | "rpc" | "nodeProvider" | "evm"
> & {
  readonly rest: undefined;
  readonly rpc: undefined;
  readonly nodeProvider: undefined;
  readonly evm?: Omit<EVMInfo, "rpc"> & {
    readonly rpc: undefined;
  };
};

export interface StarknetChainInfo {
  readonly chainId: string;
  readonly rpc: string;
  readonly currencies: ERC20Currency[];
  readonly ethContractAddress: string;
  readonly strkContractAddress: string;
}

export interface BitcoinChainInfo {
  readonly rpc: string;
  readonly rest: string;
  readonly chainId: string;
  readonly bip44: BIP44;
  readonly currencies: AppCurrency[];
}

export interface CosmosChainInfo {
  readonly rpc: string;
  readonly rest: string;
  readonly nodeProvider?: {
    readonly name: string;
    readonly email?: string;
    readonly discord?: string;
    readonly website?: string;
  };
  readonly chainId: string;
  readonly chainName: string;
  /**
   * This indicates the type of coin that can be used for stake.
   * You can get actual currency information from Currencies.
   */
  readonly stakeCurrency?: Currency;
  readonly walletUrl?: string;
  readonly walletUrlForStaking?: string;
  readonly bip44: BIP44;
  readonly alternativeBIP44s?: BIP44[];
  readonly bech32Config?: Bech32Config;

  readonly currencies: AppCurrency[];
  /**
   * This indicates which coin or token can be used for fee to send transaction.
   * You can get actual currency information from Currencies.
   */
  readonly feeCurrencies: FeeCurrency[];

  /**
   * Indicate the features supported by this chain. Ex) cosmwasm, secretwasm ...
   */
  readonly features?: string[];

  /**
   * Shows whether the blockchain is in production phase or beta phase.
   * Major features such as staking and sending are supported on staging blockchains, but without guarantee.
   * If the blockchain is in an early stage, please set it as beta.
   */
  readonly beta?: boolean;

  readonly chainSymbolImageUrl?: string;

  readonly isTestnet?: boolean;
}

export interface EvmChainInfo {
  readonly chainId: number;
  readonly rpc: string;
  readonly websocket?: string;
  readonly nativeCurrency: Currency;
  readonly tokens: ERC20Currency[];
  readonly features?: string[];
}

export type ModularChainInfoCommon = {
  readonly isV2: true;

  readonly chainId: string;
  readonly chainName: string;
  readonly chainSymbolImageUrl?: string;
  readonly isTestnet?: boolean;
  readonly hideInUI?: boolean;
  readonly isBuiltInChain?: boolean;

  readonly linkedChainKey?: string;
};
export type ModularChainInfoWithTypes =
  | {
      readonly type: "cosmos";
      readonly cosmos: CosmosChainInfo;
    }
  | {
      readonly type: "ethermint";
      readonly evm: EvmChainInfo;
      readonly cosmos: CosmosChainInfo;
    }
  | {
      readonly type: "evm";
      readonly evm: EvmChainInfo;
    }
  | {
      readonly type: "starknet";
      readonly starknet: StarknetChainInfo;
    }
  | {
      readonly type: "bitcoin";
      readonly bitcoin: BitcoinChainInfo;
    };

export type ModularChainInfo = ModularChainInfoCommon &
  ModularChainInfoWithTypes;

export type ModularChainInfoTypeNames = ModularChainInfoWithTypes["type"];

export type ModularChainInfoByType<T extends ModularChainInfoTypeNames> =
  ModularChainInfoCommon & Extract<ModularChainInfoWithTypes, { type: T }>;

export function isEthSignChain(modularChainInfo: ModularChainInfo): boolean {
  switch (modularChainInfo.type) {
    case "ethermint":
    case "evm":
      return true;
    case "cosmos":
      return (
        modularChainInfo.cosmos.bip44.coinType === 60 ||
        !!modularChainInfo.cosmos.features?.includes("eth-address-gen") ||
        !!modularChainInfo.cosmos.features?.includes("eth-key-sign")
      );
    default:
      return false;
  }
}
