import { ChainGetter, QuerySharedContext } from "@keplr-wallet/stores";
import { ObservableQueryEthereumERC20BalancesBatchParent } from "./erc20-balance-batch";

export class ERC20BalanceBatchParentStore {
  protected map: Map<string, ObservableQueryEthereumERC20BalancesBatchParent> =
    new Map();

  constructor(protected readonly sharedContext: QuerySharedContext) {}

  getOrCreate(
    chainId: string,
    chainGetter: ChainGetter,
    ethereumHexAddress: string
  ): ObservableQueryEthereumERC20BalancesBatchParent {
    const key = `${chainId}/${ethereumHexAddress.toLowerCase()}`;
    let p = this.map.get(key);
    if (!p) {
      p = new ObservableQueryEthereumERC20BalancesBatchParent(
        this.sharedContext,
        chainId,
        chainGetter,
        ethereumHexAddress
      );
      this.map.set(key, p);
    }
    return p;
  }
}
