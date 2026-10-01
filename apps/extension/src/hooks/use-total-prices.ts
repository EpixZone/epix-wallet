import { useMemo } from "react";
import { useSpendablePrice } from "./use-spendable-total-price";
import { useStakedTotalPrice } from "./use-staked-total-price";

export function useTotalPrices() {
  const { spendableTotalPrice, hasUnavailableSpendablePrice } =
    useSpendablePrice();
  const {
    stakedTotalPrice,
    stakedTotalPriceEmbedOnlyUSD,
    hasUnavailableStakedPrice,
  } = useStakedTotalPrice();

  const totalPrice = useMemo(() => {
    if (hasUnavailableSpendablePrice || hasUnavailableStakedPrice) {
      return undefined;
    }
    if (spendableTotalPrice && stakedTotalPrice) {
      return spendableTotalPrice.add(stakedTotalPrice);
    }

    if (spendableTotalPrice) {
      return spendableTotalPrice;
    }

    if (stakedTotalPrice) {
      return stakedTotalPrice;
    }

    return undefined;
  }, [
    spendableTotalPrice,
    stakedTotalPrice,
    hasUnavailableSpendablePrice,
    hasUnavailableStakedPrice,
  ]);

  return {
    spendableTotalPrice,
    stakedTotalPrice,
    stakedTotalPriceEmbedOnlyUSD,
    totalPrice,
  };
}
