import { assertRewardsResponse, getRewardsResponse, Rewards } from "./types";
import {
  ObservableChainQuery,
  ObservableChainQueryMap,
} from "../../chain-query";
import { ChainGetter, requireCosmosInfo } from "../../../chain";
import { computed, makeObservable } from "mobx";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import {
  CoinPrimitive,
  QueryResponse,
  QuerySharedContext,
  StoreUtils,
} from "../../../common";
import { computedFn } from "mobx-utils";

export class ObservableQueryRewardsInner extends ObservableChainQuery<Rewards> {
  protected bech32Address: string;

  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    bech32Address: string
  ) {
    super(
      sharedContext,
      chainId,
      chainGetter,
      `/cosmos/distribution/v1beta1/delegators/${bech32Address}/rewards`
    );
    makeObservable(this);

    this.bech32Address = bech32Address;
  }

  protected override canFetch(): boolean {
    if (
      !requireCosmosInfo(this.chainGetter.getModularChain(this.chainId))
        .stakeCurrency
    ) {
      return false;
    }
    // If bech32 address is empty, it will always fail, so don't need to fetch it.
    return this.bech32Address.length > 0;
  }

  protected override async fetchResponse(abortController: AbortController) {
    const response = await super.fetchResponse(abortController);
    assertRewardsResponse(response.data);
    return response;
  }

  @computed
  get rewards(): CoinPretty[] {
    const mcInfo2 = this.chainGetter.getModularChain(this.chainId);

    const response = this.response
      ? getRewardsResponse(this.response.data)
      : undefined;
    if (!response?.rewards) {
      return [];
    }

    const map = new Map<string, CoinPrimitive>();
    for (const valRewards of response.rewards) {
      for (const coin of valRewards.reward ?? []) {
        const amount = new Dec(coin.amount).truncate();
        if (!amount.gt(new Int(0))) {
          continue;
        }

        const existing = map.get(coin.denom);
        if (existing) {
          existing.amount = new Int(existing.amount).add(amount).toString();
        } else {
          map.set(coin.denom, {
            denom: coin.denom,
            amount: amount.toString(),
          });
        }
      }
    }

    return StoreUtils.toCoinPretties(mcInfo2, Array.from(map.values()));
  }

  readonly getRewardsOf = computedFn(
    (validatorAddress: string): CoinPretty[] => {
      const mcInfo2 = this.chainGetter.getModularChain(this.chainId);

      const response = this.response
        ? getRewardsResponse(this.response.data)
        : undefined;
      const rewards = response?.rewards?.find((r) => {
        return r.validator_address === validatorAddress;
      });

      if (!rewards || !rewards.reward) {
        return [];
      }

      const map = new Map<string, CoinPrimitive>();
      for (const coin of rewards.reward) {
        const amount = new Dec(coin.amount).truncate();
        if (!amount.gt(new Int(0))) {
          continue;
        }

        const existing = map.get(coin.denom);
        if (existing) {
          existing.amount = new Int(existing.amount).add(amount).toString();
        } else {
          map.set(coin.denom, {
            denom: coin.denom,
            amount: amount.toString(),
          });
        }
      }

      return StoreUtils.toCoinPretties(mcInfo2, Array.from(map.values()));
    }
  );

  @computed
  get stakableReward(): CoinPretty | undefined {
    const cosmosInfo = requireCosmosInfo(
      this.chainGetter.getModularChain(this.chainId)
    );

    if (!cosmosInfo.stakeCurrency) {
      return;
    }

    const r = this.rewards.find((r) => {
      return (
        r.currency.coinMinimalDenom ===
        cosmosInfo.stakeCurrency?.coinMinimalDenom
      );
    });

    return r ?? new CoinPretty(cosmosInfo.stakeCurrency, new Int(0));
  }

  readonly getStakableRewardOf = computedFn(
    (validatorAddress: string): CoinPretty | undefined => {
      const cosmosInfo = requireCosmosInfo(
        this.chainGetter.getModularChain(this.chainId)
      );

      if (!cosmosInfo.stakeCurrency) {
        return;
      }

      const valRewards = this.getRewardsOf(validatorAddress);
      const r = valRewards.find((r) => {
        return (
          r.currency.coinMinimalDenom ===
          cosmosInfo.stakeCurrency?.coinMinimalDenom
        );
      });

      return r ?? new CoinPretty(cosmosInfo.stakeCurrency, new Int(0));
    }
  );

  @computed
  get unstakableRewards(): CoinPretty[] {
    const cosmosInfo = requireCosmosInfo(
      this.chainGetter.getModularChain(this.chainId)
    );

    return this.rewards.filter((r) => {
      return (
        r.currency.coinMinimalDenom !==
        cosmosInfo.stakeCurrency?.coinMinimalDenom
      );
    });
  }

  readonly getUnstakableRewardsOf = computedFn(
    (validatorAddress: string): CoinPretty[] => {
      return this.getRewardsOf(validatorAddress).filter((r) => {
        return (
          r.currency.coinMinimalDenom !==
          requireCosmosInfo(this.chainGetter.getModularChain(this.chainId))
            .stakeCurrency?.coinMinimalDenom
        );
      });
    }
  );

  @computed
  get pendingRewardValidatorAddresses(): string[] {
    if (!this.response) {
      return [];
    }

    const result: string[] = [];

    const response = getRewardsResponse(this.response.data);
    if (!response) {
      return [];
    }

    for (const reward of response.rewards ?? []) {
      if (reward.reward) {
        for (const r of reward.reward) {
          const dec = new Dec(r.amount);
          if (dec.truncate().gt(new Int(0))) {
            result.push(reward.validator_address);
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * getDescendingPendingRewardValidatorAddresses returns the validator addresses in descending order by stakable asset.
   */
  // ComputeFn doesn't support the default argument.
  readonly getDescendingPendingRewardValidatorAddresses = computedFn(
    (maxValiadtors: number): string[] => {
      if (!this.response) {
        return [];
      }

      const cosmosInfo = requireCosmosInfo(
        this.chainGetter.getModularChain(this.chainId)
      );

      if (!cosmosInfo.stakeCurrency) {
        return [];
      }

      const response = getRewardsResponse(this.response.data);
      if (!response) {
        return [];
      }

      const rewards = response.rewards?.slice() ?? [];
      rewards.sort((reward1, reward2) => {
        const amount1 = StoreUtils.getBalanceFromCurrency(
          cosmosInfo.stakeCurrency!,
          reward1.reward ?? []
        );

        const amount2 = StoreUtils.getBalanceFromCurrency(
          cosmosInfo.stakeCurrency!,
          reward2.reward ?? []
        );

        if (amount1.toDec().gt(amount2.toDec())) {
          return -1;
        } else {
          return 1;
        }
      });

      return rewards
        .filter((reward) => {
          if (reward.reward) {
            for (const r of reward.reward) {
              const dec = new Dec(r.amount);
              if (dec.truncate().gt(new Int(0))) {
                return true;
              }
            }
          }

          return false;
        })
        .slice(0, maxValiadtors)
        .map((r) => r.validator_address);
    }
  );

  protected override onReceiveResponse(
    response: Readonly<QueryResponse<Rewards>>
  ) {
    super.onReceiveResponse(response);

    const denoms: Set<string> = new Set();
    const mcInfo2 = this.chainGetter.getModularChain(this.chainId);
    const rewardsResponse = getRewardsResponse(response.data);
    if (!rewardsResponse) {
      return;
    }
    if (rewardsResponse.total) {
      rewardsResponse.total.forEach((coin) => {
        denoms.add(coin.denom);
      });
    }
    if (rewardsResponse.rewards) {
      rewardsResponse.rewards.forEach((reward) => {
        if (reward.reward) {
          reward.reward.forEach((r) => {
            denoms.add(r.denom);
          });
        }
      });
    }

    mcInfo2.addUnknownDenoms(...denoms);
  }
}

export class ObservableQueryRewards extends ObservableChainQueryMap<Rewards> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super(sharedContext, chainId, chainGetter, (bech32Address: string) => {
      return new ObservableQueryRewardsInner(
        this.sharedContext,
        this.chainId,
        this.chainGetter,
        bech32Address
      );
    });
  }

  getQueryBech32Address(bech32Address: string): ObservableQueryRewardsInner {
    return this.get(bech32Address) as ObservableQueryRewardsInner;
  }
}
