import { CoinGeckoPriceStore } from "@keplr-wallet/stores";
import { makeURL } from "@keplr-wallet/simple-fetch";
import { makeObservable, observable, runInAction } from "mobx";
import { CoinPretty, PricePretty } from "@keplr-wallet/unit";
import { EPIX_PRICE_EXPIRY, EPIX_PRICE_ID, fetchEpixPrices } from "./epix";

export class EpixPriceStore extends CoinGeckoPriceStore {
  @observable
  private expiryClock = Date.now();
  private expiryTimer?: ReturnType<typeof setTimeout>;

  constructor(...args: ConstructorParameters<typeof CoinGeckoPriceStore>) {
    super(...args);
    makeObservable(this);
  }

  protected override async onStart() {
    await super.onStart();
    this.scheduleExpiry(this.response);
  }

  protected override onStop() {
    clearTimeout(this.expiryTimer);
    super.onStop();
  }

  protected override onReceiveResponse(
    response: NonNullable<CoinGeckoPriceStore["response"]>
  ) {
    super.onReceiveResponse(response);
    this.scheduleExpiry(response);
  }

  private scheduleExpiry(response: CoinGeckoPriceStore["response"]) {
    clearTimeout(this.expiryTimer);
    const expires = response?.data[EPIX_PRICE_ID]?.[EPIX_PRICE_EXPIRY];
    if (!this.isStarted || !expires) return;
    this.expiryTimer = setTimeout(() => {
      // Date.now alone is not observable. Invalidate mounted price views even
      // if a refresh is slow or offline when the last usable quote expires.
      runInAction(() => {
        this.expiryClock = Date.now();
      });
    }, Math.max(0, expires - Date.now()));
  }

  protected override async fetchResponse(controller: AbortController) {
    const url = new URL(makeURL(this.baseURL, this.url));
    if (
      !(url.searchParams.get("ids") ?? "").split(",").includes(EPIX_PRICE_ID)
    ) {
      return super.fetchResponse(controller);
    }
    const response = await fetchEpixPrices(url.toString(), controller.signal);
    const previous = { ...this.response?.data };
    // Missing, expired or divergent EPIX quotes must replace the old quote.
    // Other assets retain the existing store's cache/merge behavior.
    delete previous[EPIX_PRICE_ID];
    return {
      ...response,
      data: Object.fromEntries(
        Object.entries({ ...previous, ...response.data }).map(
          ([coinId, prices]) => [coinId, { ...previous[coinId], ...prices }]
        )
      ),
    };
  }

  protected override getPriceFromResponse(coinId: string, vsCurrency: string) {
    if (coinId === EPIX_PRICE_ID) {
      const expires = this.response?.data[EPIX_PRICE_ID]?.[EPIX_PRICE_EXPIRY];
      if (
        !expires ||
        expires <= Math.max(this.expiryClock, Date.now()) ||
        this.error
      )
        return undefined;
    }
    return super.getPriceFromResponse(coinId, vsCurrency);
  }

  override waitPrice(coinId: string, vsCurrency?: string) {
    if (
      coinId === EPIX_PRICE_ID &&
      this.getPrice(coinId, vsCurrency) === undefined
    ) {
      return this.waitFreshPrice(coinId, vsCurrency);
    }
    return super.waitPrice(coinId, vsCurrency);
  }

  private usableValue(coin: CoinPretty, price: PricePretty | undefined) {
    return coin.currency.coinGeckoId === EPIX_PRICE_ID && !price?.isReady
      ? undefined
      : price;
  }

  override calculatePrice(coin: CoinPretty, vsCurrency?: string) {
    return this.usableValue(coin, super.calculatePrice(coin, vsCurrency));
  }

  override async waitCalculatePrice(coin: CoinPretty, vsCurrency?: string) {
    return this.usableValue(
      coin,
      await super.waitCalculatePrice(coin, vsCurrency)
    );
  }

  override async waitFreshCalculatePrice(
    coin: CoinPretty,
    vsCurrency?: string
  ) {
    return this.usableValue(
      coin,
      await super.waitFreshCalculatePrice(coin, vsCurrency)
    );
  }
}
