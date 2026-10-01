import { MemoryKVStore } from "@keplr-wallet/common";
import { CoinPretty } from "@keplr-wallet/unit";
import { autorun } from "mobx";
import { EpixPriceStore } from "./index";
import { EPIX_PRICE_EXPIRY } from "./epix";

const usd = { currency: "usd", symbol: "$", maxDecimals: 2, locale: "en-US" };
const eur = { currency: "eur", symbol: "€", maxDecimals: 2, locale: "en-US" };
const now = Date.parse("2026-10-01T18:30:00Z");
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

class TestPriceStore extends EpixPriceStore {
  constructor(fetchingInterval = 0) {
    super(new MemoryKVStore("prices"), { usd, eur }, "usd", {
      throttleDuration: 0,
      fetchingInterval,
    });
  }
  protected override canFetch() {
    return false;
  }
  seed(data: Record<string, Record<string, number>>) {
    const response = {
      data,
      staled: false,
      local: false,
      timestamp: Date.now(),
    };
    this.onReceiveResponse(response);
    this.setResponse(response);
  }
  fail() {
    this.setError({ status: 0, statusText: "offline", message: "offline" });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
});
afterEach(() => {
  jest.useRealTimers();
});

it("converts the exact 1000 EPIX balance and leaves other assets unchanged", async () => {
  const store = new TestPriceStore();
  await flush();
  store.seed({
    epix: { usd: 0.000071, eur: 0.000063, [EPIX_PRICE_EXPIRY]: now + 60_000 },
    bitcoin: { usd: 60000 },
  });
  const coin = new CoinPretty(
    {
      coinDenom: "EPIX",
      coinMinimalDenom: "aepix",
      coinDecimals: 18,
      coinGeckoId: "epix",
    },
    "1000000000000000000000"
  );
  const price = store.calculatePrice(coin);
  expect(price?.isReady).toBe(true);
  expect(price?.toDec().toString()).toBe("0.071000000000000000");
  expect(
    (await store.waitCalculatePrice(coin, "eur"))?.toDec().toString()
  ).toBe("0.063000000000000000");
  expect(store.getPrice("bitcoin", "usd")).toBe(60000);
});

it("does not present expired, unvalidated or failed quotes as zero or ready prices", async () => {
  const store = new TestPriceStore();
  await flush();
  store.seed({ epix: { usd: 0.00007 } });
  expect(store.getPrice("epix")).toBeUndefined();
  store.seed({ epix: { usd: 0.00007, [EPIX_PRICE_EXPIRY]: now } });
  expect(store.getPrice("epix")).toBeUndefined();
  store.seed({ epix: { usd: 0.00007, [EPIX_PRICE_EXPIRY]: now + 60_000 } });
  store.fail();
  expect(store.getPrice("epix")).toBeUndefined();
  expect(await store.waitFreshPrice("epix")).toBeUndefined();
  const coin = new CoinPretty(
    {
      coinDenom: "EPIX",
      coinMinimalDenom: "aepix",
      coinDecimals: 18,
      coinGeckoId: "epix",
    },
    "1000000000000000000000"
  );
  expect(store.calculatePrice(coin)).toBeUndefined();
  expect(await store.waitCalculatePrice(coin)).toBeUndefined();
  expect(await store.waitFreshCalculatePrice(coin)).toBeUndefined();
  const zero = new CoinPretty(coin.currency, "0");
  expect(store.calculatePrice(zero)?.isReady).toBe(true);
  expect(store.calculatePrice(zero)?.toDec().toString()).toBe(
    "0.000000000000000000"
  );
});

it("invalidates an observed quote exactly at expiry without a network response", async () => {
  const store = new TestPriceStore();
  await flush();
  store.seed({ epix: { usd: 0.00007, [EPIX_PRICE_EXPIRY]: now + 1_000 } });
  const values: (number | undefined)[] = [];
  const dispose = autorun(() => {
    values.push(store.getPrice("epix"));
  });
  await flush();
  expect(values[values.length - 1]).toBe(0.00007);
  jest.advanceTimersByTime(1_000);
  expect(values[values.length - 1]).toBeUndefined();
  dispose();
  expect(jest.getTimerCount()).toBe(0);
});

it("finishes initialization when the first price is observed before hydration", async () => {
  const store = new TestPriceStore();
  const dispose = autorun(() => store.getPrice("epix"));
  await flush();
  expect(store.isInitialized).toBe(true);
  expect(store.isFetching).toBe(false);
  dispose();
});

it("does not install a polling timer if its observer leaves during initialization", async () => {
  const store = new TestPriceStore(60_000);
  const dispose = autorun(() => store.getPrice("epix"));
  dispose();
  await flush();
  expect(store.isInitialized).toBe(true);
  expect(store.isStarted).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

it("keeps only one polling timer after a rapid observer restart during initialization", async () => {
  const store = new TestPriceStore(60_000);
  const first = autorun(() => store.getPrice("epix"));
  first();
  const second = autorun(() => store.getPrice("epix"));
  await flush();
  expect(jest.getTimerCount()).toBe(1);
  second();
  expect(jest.getTimerCount()).toBe(0);
});
