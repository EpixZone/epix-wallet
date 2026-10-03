import { CoinPretty } from "@keplr-wallet/unit";
import { StoreUtils } from "@keplr-wallet/stores";
import { EPIX_CURRENCY, OSMOSIS_SWAP_TOKENS } from "./tokens";
import { swapBalanceView } from "./swap-balance";

const currency = OSMOSIS_SWAP_TOKENS[1];
const error = {
  status: 503,
  statusText: "Unavailable",
  message: "Unavailable",
};
function query(data: unknown) {
  return {
    currency,
    response: { data, staled: false, local: false, timestamp: 1000 },
    error: undefined,
    isFetching: false,
  };
}

it("shows confirmed missing factory holdings as zero despite the shared CoinPretty readiness flag", () => {
  const balances = [{ denom: "uosmo", amount: "123456" }];
  expect(StoreUtils.getBalanceFromCurrency(currency, balances).isReady).toBe(
    false
  );
  expect(
    swapBalanceView(query({ balances, pagination: { next_key: null } }))
  ).toEqual({ status: "ready", amount: "0 USDT" });
});

it.each([
  { balances: [], pagination: { next_key: "", total: "0" } },
  { balances: [{ denom: currency.coinMinimalDenom, amount: "0" }] },
])("shows zero only from a successful bank response: %j", (data) => {
  expect(swapBalanceView(query(data))).toEqual({
    status: "ready",
    amount: "0 USDT",
  });
});

it.each([1, 2, 3, 4])(
  "formats exact native bank units for supported asset index %s",
  (index) => {
    const asset = OSMOSIS_SWAP_TOKENS[index];
    const result = swapBalanceView({
      ...query({ balances: [{ denom: asset.coinMinimalDenom, amount: "1" }] }),
      currency: asset,
    });
    expect(result).toEqual({
      status: "ready",
      amount: new CoinPretty(asset, "1")
        .maxDecimals(asset.coinDecimals)
        .trim(true)
        .toString(),
    });
    expect(result.amount).not.toMatch(/^0 /);
  }
);

it.each([
  ["1000000000000000000000", "1,000 EPIX"],
  ["1", "0.000000000000000001 EPIX"],
])(
  "preserves forward Epix bank balances at 18 decimals: %s",
  (amount, expected) => {
    expect(
      swapBalanceView({
        ...query({ balances: [{ denom: "aepix", amount }] }),
        currency: EPIX_CURRENCY,
      })
    ).toEqual({ status: "ready", amount: expected });
  }
);

it("does not turn an unstarted, loading, failed, or retrying query into zero", () => {
  expect(swapBalanceView()).toEqual({ status: "loading" });
  const loading = {
    ...query(undefined),
    response: undefined,
    isFetching: true,
  };
  expect(swapBalanceView(loading)).toEqual({ status: "loading" });
  expect(swapBalanceView({ ...loading, error, isFetching: false })).toEqual({
    status: "error",
  });
  expect(swapBalanceView({ ...query({ balances: [] }), error })).toEqual({
    status: "error",
  });
  expect(
    swapBalanceView({ ...query({ balances: [] }), error, isFetching: true })
  ).toEqual({ status: "loading" });
});

it.each([
  {},
  { balances: null },
  { balances: [] as unknown[], pagination: { next_key: "more-coins" } },
  { balances: [] as unknown[], pagination: "invalid" },
  { balances: [{ denom: currency.coinMinimalDenom, amount: "-1" }] },
  { balances: [{ denom: currency.coinMinimalDenom, amount: 1 }] },
  { balances: [{ denom: currency.coinMinimalDenom, amount: "1.1" }] },
  {
    balances: [
      {
        denom: currency.coinMinimalDenom,
        amount: (BigInt(1) << BigInt(256)).toString(),
      },
    ],
  },
  {
    balances: Array.from({ length: 2 }, () => ({
      denom: currency.coinMinimalDenom,
      amount: "1",
    })),
  },
])("keeps malformed or incomplete bank data unavailable: %j", (data) => {
  expect(swapBalanceView(query(data))).toEqual({ status: "error" });
});

it("retains a successful balance while refreshing and does not reuse another selected asset", () => {
  const current = {
    ...query({
      balances: [{ denom: currency.coinMinimalDenom, amount: "1000001" }],
    }),
    isFetching: true,
  };
  expect(swapBalanceView(current)).toEqual({
    status: "ready",
    amount: "1.000001 USDT",
  });
  expect(
    swapBalanceView({ ...current, currency: OSMOSIS_SWAP_TOKENS[4] })
  ).toEqual({ status: "ready", amount: "0 USDC" });
});
