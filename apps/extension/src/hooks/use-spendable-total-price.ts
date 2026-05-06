import { useMemo } from "react";
import { useStore } from "../stores";
import { PricePretty } from "@keplr-wallet/unit";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { isUsdAggregationShadowedByVisiblePrimaryAsset } from "../utils/is-usd-aggregation-shadowed-by-visible-primary-asset";

export function useSpendablePrice() {
  const {
    chainStore,
    hugeQueriesStore,
    keyRingStore,
    priceStore,
    uiConfigStore,
  } = useStore();

  const disabledViewAssetTokenMap =
    uiConfigStore.manageViewAssetTokenConfig.getViewAssetTokenMapByVaultId(
      keyRingStore.selectedKeyInfo?.id ?? ""
    );

  const spendableTotalPrice = useMemo(() => {
    let result: PricePretty | undefined;
    for (const bal of hugeQueriesStore.allKnownBalances) {
      const disabledCoinSet = disabledViewAssetTokenMap.get(
        ChainIdHelper.parse(bal.chainInfo.chainId).identifier
      );

      if (disabledCoinSet?.has(bal.token.currency.coinMinimalDenom)) {
        continue;
      }

      if (
        isUsdAggregationShadowedByVisiblePrimaryAsset(
          chainStore,
          disabledViewAssetTokenMap,
          bal.chainInfo.chainId,
          bal.token.currency.coinMinimalDenom
        )
      ) {
        continue;
      }

      const price = bal.price ?? priceStore.calculatePrice(bal.token);
      if (price) {
        if (!result) {
          result = price;
        } else {
          result = result.add(price);
        }
      }
    }
    return result;
  }, [
    chainStore,
    hugeQueriesStore.allKnownBalances,
    disabledViewAssetTokenMap,
    priceStore,
  ]);

  return {
    spendableTotalPrice,
  };
}
