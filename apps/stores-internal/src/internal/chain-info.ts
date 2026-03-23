import { IChainStore } from "@keplr-wallet/stores";

export interface InternalChainStore extends IChainStore {
  isInChainInfosInListUI(chainId: string): boolean;
}
