import { ObservableChainQuery } from "../../chain-query";
import { StakingPool } from "./types";
import { ChainGetter, requireCosmosInfo } from "../../../chain";
import { computed, makeObservable } from "mobx";
import { CoinPretty } from "@keplr-wallet/unit";
import { QuerySharedContext } from "../../../common";
import { ENDPOINT_BY_CHAIN_ID } from "./endpoint-by-chain-id";

export class ObservableQueryStakingPool extends ObservableChainQuery<StakingPool> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super(
      sharedContext,
      chainId,
      chainGetter,
      ENDPOINT_BY_CHAIN_ID[chainId]?.["pool"] ?? "/cosmos/staking/v1beta1/pool"
    );

    makeObservable(this);
  }

  protected override canFetch(): boolean {
    if (
      !requireCosmosInfo(this.chainGetter.getModularChain(this.chainId))
        .stakeCurrency
    ) {
      return false;
    }
    return super.canFetch();
  }

  @computed
  get notBondedTokens(): CoinPretty | undefined {
    const cosmosInfo = requireCosmosInfo(
      this.chainGetter.getModularChain(this.chainId)
    );

    if (!cosmosInfo.stakeCurrency) {
      return;
    }

    if (!this.response) {
      return new CoinPretty(cosmosInfo.stakeCurrency, 0);
    }

    const amount = !Array.isArray(this.response.data.pool.not_bonded_tokens)
      ? this.response.data.pool.not_bonded_tokens
      : this.response.data.pool.not_bonded_tokens.find(
          (c) => c.denom === cosmosInfo.stakeCurrency?.coinMinimalDenom
        )?.amount || "0";

    return new CoinPretty(cosmosInfo.stakeCurrency, amount);
  }

  @computed
  get bondedTokens(): CoinPretty | undefined {
    const cosmosInfo = requireCosmosInfo(
      this.chainGetter.getModularChain(this.chainId)
    );

    if (!cosmosInfo.stakeCurrency) {
      return;
    }

    if (!this.response) {
      return new CoinPretty(cosmosInfo.stakeCurrency, 0);
    }

    const amount = !Array.isArray(this.response.data.pool.bonded_tokens)
      ? this.response.data.pool.bonded_tokens
      : this.response.data.pool.bonded_tokens.find(
          (c) => c.denom === cosmosInfo.stakeCurrency?.coinMinimalDenom
        )?.amount || "0";

    return new CoinPretty(cosmosInfo.stakeCurrency, amount);
  }
}
