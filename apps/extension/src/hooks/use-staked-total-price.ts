import { useMemo } from "react";
import { useStore } from "../stores";
import { PricePretty } from "@keplr-wallet/unit";
import { sumAssetPrices } from "./sum-asset-prices";

export function useStakedTotalPrice() {
  const { hugeQueriesStore, priceStore } = useStore();

  const stakedTotal = useMemo(() => {
    return sumAssetPrices([
      ...hugeQueriesStore.delegations,
      ...hugeQueriesStore.unbondings,
    ]);
  }, [hugeQueriesStore.delegations, hugeQueriesStore.unbondings]);

  const stakedTotalPriceEmbedOnlyUSD = useMemo(() => {
    let result: PricePretty | undefined;
    for (const bal of hugeQueriesStore.delegations) {
      if (!bal.chainInfo.embedded.isBuiltInChain) {
        continue;
      }
      if (bal.price) {
        const price = priceStore.calculatePrice(bal.token, "usd");
        if (price) {
          if (!result) {
            result = price;
          } else {
            result = result.add(price);
          }
        }
      }
    }
    for (const bal of hugeQueriesStore.unbondings) {
      if (!bal.chainInfo.embedded.isBuiltInChain) {
        continue;
      }
      if (bal.price) {
        const price = priceStore.calculatePrice(bal.token, "usd");
        if (price) {
          if (!result) {
            result = price;
          } else {
            result = result.add(price);
          }
        }
      }
    }
    return result;
  }, [hugeQueriesStore.delegations, hugeQueriesStore.unbondings, priceStore]);

  return {
    stakedTotalPrice: stakedTotal.price,
    hasUnavailableStakedPrice: stakedTotal.hasUnavailableEpixPrice,
    stakedTotalPriceEmbedOnlyUSD,
  };
}
