import { useMemo } from "react";
import { useStore } from "../stores";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { sumAssetPrices } from "./sum-asset-prices";

export function useSpendablePrice() {
  const { hugeQueriesStore, uiConfigStore, keyRingStore } = useStore();

  const disabledViewAssetTokenMap =
    uiConfigStore.manageViewAssetTokenConfig.getViewAssetTokenMapByVaultId(
      keyRingStore.selectedKeyInfo?.id ?? ""
    );

  const total = useMemo(() => {
    const visibleBalances = hugeQueriesStore.allKnownBalances.filter((bal) => {
      const disabledCoinSet = disabledViewAssetTokenMap.get(
        ChainIdHelper.parse(bal.chainInfo.chainId).identifier
      );
      return !disabledCoinSet?.has(bal.token.currency.coinMinimalDenom);
    });
    return sumAssetPrices(visibleBalances);
  }, [hugeQueriesStore.allKnownBalances, disabledViewAssetTokenMap]);

  return {
    spendableTotalPrice: total.price,
    hasUnavailableSpendablePrice: total.hasUnavailableEpixPrice,
  };
}
