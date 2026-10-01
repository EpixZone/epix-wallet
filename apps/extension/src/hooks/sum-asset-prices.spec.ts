import { CoinPretty, PricePretty } from "@keplr-wallet/unit";
import { sumAssetPrices } from "./sum-asset-prices";

const usd = { currency: "usd", symbol: "$", maxDecimals: 2, locale: "en-US" };
const epix = {
  coinDenom: "EPIX",
  coinMinimalDenom: "aepix",
  coinDecimals: 18,
  coinGeckoId: "epix",
};
const funded = new CoinPretty(epix, "1000000000000000000000");
const zero = new CoinPretty(epix, "0");

describe("wallet price totals", () => {
  it("keeps a funded EPIX total unavailable while its quote is missing", () => {
    const result = sumAssetPrices([
      { token: funded },
      { token: zero, price: new PricePretty(usd, 0) },
    ]);
    expect(result.price).toBeUndefined();
    expect(result.hasUnavailableEpixPrice).toBe(true);
  });

  it("does not present the other assets as the complete total", () => {
    const result = sumAssetPrices([
      { token: funded },
      { token: zero, price: new PricePretty(usd, 5) },
    ]);
    expect(result.price).toBeUndefined();
  });

  it("adds available prices exactly", () => {
    const result = sumAssetPrices([
      { token: funded, price: new PricePretty(usd, "0.07") },
      { token: funded, price: new PricePretty(usd, "0.02") },
    ]);
    expect(result.price?.toDec().toString()).toBe("0.090000000000000000");
    expect(result.hasUnavailableEpixPrice).toBe(false);
  });

  it("preserves a real zero balance without requiring an EPIX quote", () => {
    const result = sumAssetPrices([
      { token: zero, price: new PricePretty(usd, 0) },
    ]);
    expect(result.price?.toString()).toBe("$0");
    expect(result.hasUnavailableEpixPrice).toBe(false);
  });

  it("preserves existing behavior for assets without a price source", () => {
    const unknown = new CoinPretty({ ...epix, coinGeckoId: undefined }, "1");
    const result = sumAssetPrices([
      { token: unknown },
      { token: zero, price: new PricePretty(usd, 0) },
    ]);
    expect(result.price?.toString()).toBe("$0");
    expect(result.hasUnavailableEpixPrice).toBe(false);
  });
});
