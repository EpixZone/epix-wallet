import { AppCurrency } from "@keplr-wallet/types";
import { IModularChainInfoImpl } from "./modular";

export type CurrencyRegistrar = (
  chainId: string,
  coinMinimalDenom: string
) =>
  | {
      value: AppCurrency | undefined;
      done: boolean;
    }
  | undefined;

export interface ChainGetter {
  getModularChain(chainId: string): IModularChainInfoImpl;
  hasModularChain(chainId: string): boolean;
}

export interface IChainStore extends ChainGetter {
  readonly modularChainInfos: IModularChainInfoImpl[];
}
