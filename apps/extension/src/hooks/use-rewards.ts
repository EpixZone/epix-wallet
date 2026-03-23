import { ViewToken } from "../pages/main";
import { useStore } from "../stores";
import {
  useClaimAllEachState,
  useCosmosClaimRewards,
  useStarknetClaimRewards,
} from "./claim";
import { CoinPretty, Dec, PricePretty } from "@keplr-wallet/unit";
import { NEUTRON_CHAIN_ID, NOBLE_CHAIN_ID } from "../config.ui";
import { IModularChainInfoImpl } from "@keplr-wallet/stores";
import { ClaimAllEachState } from "../stores/claim-rewards-state";

export interface ViewClaimToken extends Omit<ViewToken, "chainInfo"> {
  modularChainInfo: IModularChainInfoImpl;
  price?: PricePretty;
  onClaimAll: (
    chainId: string,
    rewardToken: CoinPretty,
    state: ClaimAllEachState
  ) => void | Promise<void>;
  onClaimSingle: (
    chainId: string,
    state: ClaimAllEachState
  ) => void | Promise<void>;
}

const USDN_CURRENCY = {
  coinDenom: "USDN",
  coinMinimalDenom: "uusdn",
  coinDecimals: 6,
};

const zeroDec = new Dec(0);

export function useRewards() {
  const {
    chainStore,
    accountStore,
    queriesStore,
    starknetQueriesStore,
    priceStore,
    analyticsStore,
    keyRingStore,
  } = useStore();

  const { handleCosmosClaimAllEach, handleCosmosClaimSingle } =
    useCosmosClaimRewards();
  const { handleStarknetClaimAllEach, handleStarknetClaimSingle } =
    useStarknetClaimRewards();

  const { states, getClaimAllEachState } = useClaimAllEachState();

  const viewClaimTokens: ViewClaimToken[] = (() => {
    const res: ViewClaimToken[] = [];
    for (const modularChainInfo of chainStore.modularChainInfosInUI) {
      const chainId = modularChainInfo.chainId;
      const account = accountStore.getAccount(chainId);
      const isNeutron = chainId === NEUTRON_CHAIN_ID;

      if (isNeutron && account.bech32Address) {
        const queries = queriesStore.get(chainId);
        const queryNeutronRewardInner =
          queries.cosmwasm.queryNeutronStakingRewards.getRewardFor(
            account.bech32Address
          );
        const reward = queryNeutronRewardInner.pendingReward;

        if (reward && reward.toDec().gt(zeroDec)) {
          res.push({
            token: reward,
            price: priceStore.calculatePrice(reward),
            modularChainInfo: modularChainInfo,
            isFetching: queryNeutronRewardInner.isFetching,
            error: queryNeutronRewardInner.error,
            onClaimAll: handleCosmosClaimAllEach,
            onClaimSingle: handleCosmosClaimSingle,
          });
        }
      } else if (
        modularChainInfo.type === "cosmos" ||
        modularChainInfo.type === "ethermint"
      ) {
        if (modularChainInfo.type === "ethermint") {
          // ethermint(evm+cosmos) chains don't have staking rewards via cosmos in v2
          // but they may have cosmos staking, so we don't skip
        }

        const accountAddress = account.bech32Address;
        const queries = queriesStore.get(chainId);
        const u = modularChainInfo.unwrapped;

        if (chainId === NOBLE_CHAIN_ID) {
          const queryYield =
            queries.noble.queryYield.getQueryBech32Address(accountAddress);
          const usdnCurrency =
            modularChainInfo.findCurrency("uusdn") || USDN_CURRENCY;
          const rawAmount = queryYield.claimableAmount;
          const amount = new CoinPretty(usdnCurrency, rawAmount);
          if (amount.toDec().gt(new Dec(0))) {
            res.push({
              token: amount,
              price: priceStore.calculatePrice(amount),
              modularChainInfo: modularChainInfo,
              isFetching: queryYield.isFetching,
              error: queryYield.error,
              onClaimAll: handleCosmosClaimAllEach,
              onClaimSingle: handleCosmosClaimSingle,
            });
          }
        }

        const queryRewards =
          queries.cosmos.queryRewards.getQueryBech32Address(accountAddress);

        const cosmosInfo =
          u.type === "cosmos" || u.type === "ethermint" ? u.cosmos : undefined;
        const targetDenom = (() => {
          if (modularChainInfo.chainIdentifier === "dydx-mainnet") {
            return "ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5";
          }

          if (modularChainInfo.chainIdentifier === "elys") {
            return "ueden";
          }

          return cosmosInfo?.stakeCurrency?.coinMinimalDenom;
        })();

        if (targetDenom) {
          const currency = modularChainInfo.findCurrency(targetDenom);
          if (currency) {
            const reward = queryRewards.rewards.find(
              (r) => r.currency.coinMinimalDenom === targetDenom
            );
            if (reward) {
              res.push({
                token: reward,
                price: priceStore.calculatePrice(reward),
                modularChainInfo: modularChainInfo,
                isFetching: queryRewards.isFetching,
                error: queryRewards.error,
                onClaimAll: handleCosmosClaimAllEach,
                onClaimSingle: handleCosmosClaimSingle,
              });
            }
          }
        }
      } else if (modularChainInfo.type === "starknet") {
        if (chainId !== "starknet:SN_MAIN") {
          continue;
        }

        const queryStakingInfo = starknetQueriesStore
          .get(chainId)
          .stakingInfoManager.getStakingInfo(
            accountStore.getAccount(modularChainInfo.chainId).starknetHexAddress
          );

        const totalClaimableRewardAmount =
          queryStakingInfo?.totalClaimableRewardAmount;

        if (totalClaimableRewardAmount?.toDec().gt(zeroDec)) {
          res.push({
            token: totalClaimableRewardAmount,
            price: priceStore.calculatePrice(totalClaimableRewardAmount),
            modularChainInfo: modularChainInfo,
            isFetching: queryStakingInfo?.isFetching ?? false,
            error: queryStakingInfo?.error,
            onClaimAll: handleStarknetClaimAllEach,
            onClaimSingle: handleStarknetClaimSingle,
          });
        }
      }
    }

    return res
      .filter((viewToken) => viewToken.token.toDec().gt(zeroDec))
      .sort((a, b) => {
        const aPrice = priceStore.calculatePrice(a.token)?.toDec() ?? zeroDec;
        const bPrice = priceStore.calculatePrice(b.token)?.toDec() ?? zeroDec;

        if (aPrice.equals(bPrice)) {
          return 0;
        }
        return aPrice.gt(bPrice) ? -1 : 1;
      })
      .sort((a, b) => {
        const aHasError =
          getClaimAllEachState(a.modularChainInfo.chainId).failedReason != null;
        const bHasError =
          getClaimAllEachState(b.modularChainInfo.chainId).failedReason != null;

        if (aHasError || bHasError) {
          if (aHasError && bHasError) {
            return 0;
          } else if (aHasError) {
            return 1;
          } else {
            return -1;
          }
        }

        return 0;
      });
  })();

  const totalPrice = (() => {
    const fiatCurrency = priceStore.getFiatCurrency(
      priceStore.defaultVsCurrency
    );
    if (!fiatCurrency) {
      return undefined;
    }

    let res = new PricePretty(fiatCurrency, 0);

    for (const viewClaimToken of viewClaimTokens) {
      const price = priceStore.calculatePrice(viewClaimToken.token);
      if (price) {
        res = res.add(price);
      }
    }

    return res;
  })();

  const isLedger =
    keyRingStore.selectedKeyInfo &&
    keyRingStore.selectedKeyInfo.type === "ledger";

  const isKeystone =
    keyRingStore.selectedKeyInfo &&
    keyRingStore.selectedKeyInfo.type === "keystone";

  const claimAll = () => {
    analyticsStore.logEvent("click_claimAll");

    for (const viewClaimToken of viewClaimTokens) {
      const state = getClaimAllEachState(
        viewClaimToken.modularChainInfo.chainId
      );

      viewClaimToken.onClaimAll(
        viewClaimToken.modularChainInfo.chainId,
        viewClaimToken.token,
        state
      );
    }
  };

  const claimAllDisabled = (() => {
    if (viewClaimTokens.length === 0) {
      return true;
    }

    for (const viewClaimToken of viewClaimTokens) {
      if (viewClaimToken.token.toDec().gt(new Dec(0))) {
        return false;
      }
    }

    return true;
  })();

  return {
    viewClaimTokens,
    totalPrice,
    isLedger,
    isKeystone,
    claimAll,
    claimAllDisabled,
    getClaimAllEachState,
    states,
  };
}
