import { ChainGetter, HasMapStore } from "@keplr-wallet/stores";
import { StarknetAccountBase } from "./base";
import { Keplr } from "@keplr-wallet/types";

export class StarknetAccountStore extends HasMapStore<StarknetAccountBase> {
  constructor(
    protected readonly chainGetter: ChainGetter,
    protected readonly getKeplr: () => Promise<Keplr | undefined>
  ) {
    super((chainId: string) => {
      return new StarknetAccountBase(chainGetter, chainId, getKeplr);
    });
  }

  getAccount(chainId: string): StarknetAccountBase {
    const mcInfo2 = this.chainGetter.getModularChain(chainId);
    if (mcInfo2.type !== "starknet") {
      throw new Error(`${chainId} is not starknet chain`);
    }
    return this.get(mcInfo2.chainId);
  }
}
