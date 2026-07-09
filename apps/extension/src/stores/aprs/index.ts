import { ChainStore } from "../chain";
import { CosmosQueries, IQueriesStore } from "@keplr-wallet/stores";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { computedFn } from "mobx-utils";
import { EpixChainId } from "../../config.ui";

// The EPIX chain disables the standard cosmos mint module and exposes its own
// mint module instead, so the usual APR sources know nothing about it.
// Its APR is computed on the client from the chain's own LCD endpoints.
const EPIX_CHAIN_IDENTIFIER = ChainIdHelper.parse(EpixChainId).identifier;

const APR_LAMBDA_BASE_URL = "https://apr-lambda.keplr.app";

/**
 * Staking APR per chain. Ported from the mobile app's aprs queries but shaped
 * as a plain store because the extension consumes it from React pages via
 * `useStore()` rather than through a queries plugin.
 *
 * `getApr` returns the APR as a percent (e.g. 105.3 for 105.3%) or undefined
 * when the chain has no APR source. Callers must hide the APR UI when
 * undefined is returned.
 */
export class AprsStore {
  constructor(
    protected readonly chainStore: ChainStore,
    protected readonly queriesStore: IQueriesStore<CosmosQueries>
  ) {}

  readonly getApr = computedFn((chainId: string): Dec | undefined => {
    if (!this.chainStore.hasModularChain(chainId)) {
      return undefined;
    }

    const modularChainInfo = this.chainStore.getModularChain(chainId);
    const u = modularChainInfo.unwrapped;
    if (u.type !== "cosmos" && u.type !== "ethermint") {
      return undefined;
    }
    if (!u.cosmos.stakeCurrency) {
      return undefined;
    }

    const chainIdentifier = ChainIdHelper.parse(chainId).identifier;
    if (chainIdentifier === EPIX_CHAIN_IDENTIFIER) {
      return this.getEpixApr(chainId);
    }

    const queryApr = this.queriesStore.simpleQuery.queryGet<{
      apr: number;
    }>(APR_LAMBDA_BASE_URL, `/apr/${chainIdentifier}`);

    if (
      queryApr.response &&
      "apr" in queryApr.response.data &&
      typeof queryApr.response.data.apr === "number" &&
      queryApr.response.data.apr > 0
    ) {
      return new Dec(queryApr.response.data.apr).mul(new Dec(100));
    }

    return undefined;
  });

  // apr = inflation * staking_rewards_rate / bonded_ratio
  // - inflation and staking_rewards_rate come from the chain's custom mint
  //   module (/epix/mint/v1beta1/*).
  // - bonded_ratio = bonded tokens / total supply of the stake currency.
  protected readonly getEpixApr = computedFn(
    (chainId: string): Dec | undefined => {
      const modularChainInfo = this.chainStore.getModularChain(chainId);
      const u = modularChainInfo.unwrapped;
      if (u.type !== "cosmos" && u.type !== "ethermint") {
        return undefined;
      }
      const stakeCurrency = u.cosmos.stakeCurrency;
      if (!stakeCurrency) {
        return undefined;
      }

      const rest = u.cosmos.rest;

      const queryInflation = this.queriesStore.simpleQuery.queryGet<{
        inflation: string;
      }>(rest, "/epix/mint/v1beta1/inflation");
      const queryMintParams = this.queriesStore.simpleQuery.queryGet<{
        params: {
          staking_rewards_rate: string;
        };
      }>(rest, "/epix/mint/v1beta1/params");
      const querySupply = this.queriesStore.simpleQuery.queryGet<{
        amount: {
          denom: string;
          amount: string;
        };
      }>(rest, `/cosmos/bank/v1beta1/supply/${stakeCurrency.coinMinimalDenom}`);

      const bondedTokens =
        this.queriesStore.get(chainId).cosmos.queryPool.bondedTokens;

      if (
        !queryInflation.response?.data?.inflation ||
        !queryMintParams.response?.data?.params?.staking_rewards_rate ||
        !querySupply.response?.data?.amount?.amount ||
        !bondedTokens
      ) {
        return undefined;
      }

      try {
        const inflation = new Dec(queryInflation.response.data.inflation);
        const stakingRewardsRate = new Dec(
          queryMintParams.response.data.params.staking_rewards_rate
        );
        const supply = new CoinPretty(
          stakeCurrency,
          querySupply.response.data.amount.amount
        ).toDec();

        if (supply.isZero()) {
          return undefined;
        }

        const bondedRatio = bondedTokens.toDec().quo(supply);
        if (bondedRatio.lte(new Dec(0))) {
          return undefined;
        }

        const apr = inflation.mul(stakingRewardsRate).quo(bondedRatio);
        if (apr.lte(new Dec(0))) {
          return undefined;
        }

        return apr.mul(new Dec(100));
      } catch (e) {
        console.log(e);
        return undefined;
      }
    }
  );
}
