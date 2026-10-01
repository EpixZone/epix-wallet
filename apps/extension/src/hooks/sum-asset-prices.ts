import { CoinPretty, Dec, PricePretty } from "@keplr-wallet/unit";
import { EPIX_PRICE_ID } from "../stores/price/epix";

export function sumAssetPrices(
  balances: readonly { token: CoinPretty; price?: PricePretty }[]
) {
  let price: PricePretty | undefined;
  let hasUnavailableEpixPrice = false;
  for (const balance of balances) {
    if (
      balance.token.currency.coinGeckoId === EPIX_PRICE_ID &&
      balance.token.toDec().gt(new Dec(0)) &&
      !balance.price
    ) {
      hasUnavailableEpixPrice = true;
    }
    if (balance.price) {
      price = price ? price.add(balance.price) : balance.price;
    }
  }
  return {
    price: hasUnavailableEpixPrice ? undefined : price,
    hasUnavailableEpixPrice,
  };
}
