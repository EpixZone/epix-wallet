import {
  ObservableChainQuery,
  ObservableChainQueryMap,
} from "../../chain-query";
import {
  assertInitiaDelegationsResponse,
  Delegation,
  getInitiaDelegationResponses,
  InitiaDelegations,
} from "./types";
import { ChainGetter, requireCosmosInfo } from "../../../chain";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";
import { QuerySharedContext } from "../../../common";
import { Coin } from "@keplr-wallet/types";

export class ObservableQueryInitiaDelegationsInner extends ObservableChainQuery<InitiaDelegations> {
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
      `/initia/mstaking/v1/delegations/${bech32Address}`
    );
    makeObservable(this);

    this.bech32Address = bech32Address;
  }

  protected override canFetch(): boolean {
    // If bech32 address is empty, it will always fail, so don't need to fetch it.
    return (
      this.bech32Address.length > 0 ||
      requireCosmosInfo(this.chainGetter.getModularChain(this.chainId))
        .stakeCurrency != null
    );
  }

  protected override async fetchResponse(abortController: AbortController) {
    const response = await super.fetchResponse(abortController);
    assertInitiaDelegationsResponse(response.data);
    return response;
  }

  // a function to extract amount from delegation balance
  // For Initia chain, the balance is an array of Coin
  protected getAmountFromBalanceArray(balance: Coin[]): string {
    const stakeDenom = requireCosmosInfo(
      this.chainGetter.getModularChain(this.chainId)
    ).stakeCurrency?.coinMinimalDenom;

    if (!stakeDenom) {
      return "0";
    }

    const coin = (balance as Coin[]).find((coin) => coin.denom === stakeDenom);
    return coin?.amount ?? "0";
  }

  @computed
  get total(): CoinPretty | undefined {
    const cosmosInfo = requireCosmosInfo(
      this.chainGetter.getModularChain(this.chainId)
    );
    const stakeCurrency = cosmosInfo.stakeCurrency;

    if (!stakeCurrency) {
      return;
    }

    if (!this.response) {
      return new CoinPretty(stakeCurrency, new Int(0)).ready(false);
    }

    const delegationResponses = getInitiaDelegationResponses(
      this.response.data
    );
    if (!delegationResponses) {
      return new CoinPretty(stakeCurrency, new Int(0)).ready(false);
    }

    let totalBalance = new Int(0);
    for (const delegation of delegationResponses) {
      const amount = this.getAmountFromBalanceArray(delegation.balance);

      const amountInt = new Int(amount);
      if (amountInt.gt(new Int(0))) {
        totalBalance = totalBalance.add(amountInt);
      }
    }

    return new CoinPretty(stakeCurrency, totalBalance);
  }

  @computed
  get delegationBalances(): {
    validatorAddress: string;
    balance: CoinPretty;
  }[] {
    if (!this.response) {
      return [];
    }

    const cosmosInfo = requireCosmosInfo(
      this.chainGetter.getModularChain(this.chainId)
    );
    const stakeCurrency = cosmosInfo.stakeCurrency;

    if (!stakeCurrency) {
      return [];
    }

    const result = [];

    const delegationResponses = getInitiaDelegationResponses(
      this.response.data
    );
    if (!delegationResponses) {
      return [];
    }

    for (const delegation of delegationResponses) {
      const amount = this.getAmountFromBalanceArray(delegation.balance);

      const balance = new CoinPretty(stakeCurrency, new Int(amount));

      if (balance.toDec().gt(new Dec(0))) {
        result.push({
          validatorAddress: delegation.delegation.validator_address,
          balance,
        });
      }
    }

    return result;
  }

  @computed
  get delegations(): Delegation[] {
    if (!this.response) {
      return [];
    }

    const cosmosInfo = requireCosmosInfo(
      this.chainGetter.getModularChain(this.chainId)
    );
    const stakeCurrency = cosmosInfo.stakeCurrency;

    const delegationResponses = getInitiaDelegationResponses(
      this.response.data
    );
    if (!delegationResponses) {
      return [];
    }

    return delegationResponses
      .filter((del) => {
        const amount = this.getAmountFromBalanceArray(del.balance);
        return new Int(amount).gt(new Int(0));
      })
      .map((del) => {
        const shares = stakeCurrency?.coinMinimalDenom
          ? del.delegation.shares.find((coin) => {
              return coin.denom === stakeCurrency.coinMinimalDenom;
            })?.amount ?? "0"
          : "0";

        return {
          ...del,
          delegation: {
            ...del.delegation,
            shares,
          },
          balance: {
            denom: stakeCurrency?.coinMinimalDenom,
            amount: this.getAmountFromBalanceArray(del.balance),
          },
        } as Delegation;
      });
  }

  readonly getDelegationTo = computedFn(
    (validatorAddress: string): CoinPretty | undefined => {
      const delegations = this.delegations;

      const cosmosInfo = requireCosmosInfo(
        this.chainGetter.getModularChain(this.chainId)
      );
      const stakeCurrency = cosmosInfo.stakeCurrency;

      if (!stakeCurrency) {
        return;
      }

      if (!this.response) {
        return new CoinPretty(stakeCurrency, new Int(0)).ready(false);
      }

      for (const delegation of delegations) {
        if (delegation.delegation.validator_address === validatorAddress) {
          return new CoinPretty(
            stakeCurrency,
            new Int(delegation.balance.amount)
          );
        }
      }

      return new CoinPretty(stakeCurrency, new Int(0));
    }
  );
}

export class ObservableQueryInitiaDelegations extends ObservableChainQueryMap<InitiaDelegations> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super(sharedContext, chainId, chainGetter, (bech32Address: string) => {
      return new ObservableQueryInitiaDelegationsInner(
        this.sharedContext,
        this.chainId,
        this.chainGetter,
        bech32Address
      );
    });
  }

  getQueryBech32Address(
    bech32Address: string
  ): ObservableQueryInitiaDelegationsInner {
    return this.get(bech32Address) as ObservableQueryInitiaDelegationsInner;
  }
}
