import { Dec } from "@keplr-wallet/unit";
import { getOsmosisFeeQuote } from "./fee";

const usdc =
  "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";
const now = Date.now();
function fixtures() {
  const fresh = () => ({
    error: undefined as unknown,
    waitFreshResponse: jest.fn().mockResolvedValue({ timestamp: now }),
  });
  const spot = { ...fresh(), spotPriceDec: new Dec("25") };
  const queries = {
    queryBaseFee: { ...fresh(), baseFee: new Dec("0.01") },
    queryTxFeesBaseDenom: { ...fresh(), baseDenom: "uosmo" },
    queryTxFeesFeeTokens: {
      ...fresh(),
      isTxFeeToken: jest.fn((denom) => denom === usdc),
    },
    queryTxFeesSpotPriceByDenom: { getQueryDenom: jest.fn(() => spot) },
  };
  return {
    queries,
    spot,
    request: {
      queries: queries as unknown as Parameters<
        typeof getOsmosisFeeQuote
      >[0]["queries"],
      feeDenom: "uosmo",
      gasUsed: 100001,
      minimumGasPrice: new Dec("0.025"),
    },
  };
}

beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(now));
afterEach(() => jest.restoreAllMocks());

it("ceil-rounds gas and native fees without fetching conversion data", async () => {
  const { queries, request } = fixtures();
  const result = await getOsmosisFeeQuote(request);
  expect(result.fee).toEqual({
    gas: "130002",
    amount: [{ denom: "uosmo", amount: "3251" }],
  });
  expect(result.expiresAt).toBe(now + 30000);
  expect(queries.queryTxFeesFeeTokens.waitFreshResponse).not.toHaveBeenCalled();
});

it("uses a higher live base fee instead of a lower configured average", async () => {
  const { queries, request } = fixtures();
  queries.queryBaseFee.baseFee = new Dec("0.05");
  expect((await getOsmosisFeeQuote(request)).gasPrice.toString()).toBe(
    "0.060000000000000000"
  );
});

it("converts allowed fee tokens in base units and rounds the final amount upward", async () => {
  const { request } = fixtures();
  const result = await getOsmosisFeeQuote({ ...request, feeDenom: usdc });
  expect(result.gasPrice.toString()).toBe("0.001010000000000000");
  expect(result.fee.amount).toEqual([{ denom: usdc, amount: "132" }]);
});

it("refuses an unlisted token before fetching its price", async () => {
  const { queries, request } = fixtures();
  await expect(
    getOsmosisFeeQuote({ ...request, feeDenom: "aepix" })
  ).rejects.toThrow("does not currently accept");
  expect(
    queries.queryTxFeesSpotPriceByDenom.getQueryDenom
  ).not.toHaveBeenCalled();
});

it.each([
  "queryBaseFee",
  "queryTxFeesBaseDenom",
  "queryTxFeesFeeTokens",
] as const)("rejects a failed %s even if it retains old data", async (key) => {
  const { queries, request } = fixtures();
  queries[key].error = new Error("offline");
  await expect(
    getOsmosisFeeQuote({ ...request, feeDenom: usdc })
  ).rejects.toThrow("unavailable");
});

it("rejects stale responses and uses the earliest successful quote expiry", async () => {
  const { queries, spot, request } = fixtures();
  queries.queryBaseFee.waitFreshResponse.mockResolvedValue({
    timestamp: now - 30000,
  });
  await expect(getOsmosisFeeQuote(request)).rejects.toThrow("unavailable");
  queries.queryBaseFee.waitFreshResponse.mockResolvedValue({
    timestamp: now,
    staled: true,
  });
  await expect(getOsmosisFeeQuote(request)).rejects.toThrow("unavailable");
  queries.queryBaseFee.waitFreshResponse.mockResolvedValue({
    timestamp: now - 1000,
  });
  spot.waitFreshResponse.mockResolvedValue({ timestamp: now - 2000 });
  expect(
    (await getOsmosisFeeQuote({ ...request, feeDenom: usdc })).expiresAt
  ).toBe(now + 28000);
});

it("rejects missing, zero or failed conversion quotes instead of quoting free fees", async () => {
  const { spot, request } = fixtures();
  spot.spotPriceDec = new Dec(0);
  await expect(
    getOsmosisFeeQuote({ ...request, feeDenom: usdc })
  ).rejects.toThrow("conversion unavailable");
  spot.spotPriceDec = new Dec("25");
  spot.error = new Error("offline");
  await expect(
    getOsmosisFeeQuote({ ...request, feeDenom: usdc })
  ).rejects.toThrow("unavailable");
});

it("does not return a fee quote after the caller cancels", async () => {
  const { queries, request } = fixtures();
  queries.queryBaseFee.waitFreshResponse.mockReturnValue(
    new Promise(() => undefined)
  );
  const controller = new AbortController();
  const quote = getOsmosisFeeQuote({ ...request, signal: controller.signal });
  controller.abort();
  await expect(quote).rejects.toThrow("unavailable");
});

it("bounds a stalled fee endpoint without returning its cached value", async () => {
  jest.useFakeTimers();
  try {
    const { queries, request } = fixtures();
    queries.queryBaseFee.waitFreshResponse.mockReturnValue(
      new Promise(() => undefined)
    );
    const quote = getOsmosisFeeQuote(request);
    const assertion = expect(quote).rejects.toThrow("unavailable");
    jest.advanceTimersByTime(10000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
