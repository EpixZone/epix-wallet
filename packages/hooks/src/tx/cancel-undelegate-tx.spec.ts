import { CancelUndelegateAmountConfig } from "./cancel-undelegate-tx";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { observable, runInAction } from "mobx";

test("cancellation tracks the selected entry's remaining balance, not the liquid balance", () => {
  const currency = {
    coinDenom: "EPIX",
    coinMinimalDenom: "aepix",
    coinDecimals: 18,
  };
  const query = observable({
    response: undefined as any,
    error: undefined as any,
    unbondingBalances: [
      {
        validatorAddress: "validator",
        entries: [
          {
            creationHeight: new Int("9007199254740993"),
            completionTime: "2099-01-01T00:00:00Z",
            balance: new CoinPretty(currency, "1000000000000000001"),
          },
          {
            creationHeight: new Int("12"),
            completionTime: "2099-01-01T00:00:00Z",
            balance: new CoinPretty(currency, "9000000000000000000"),
          },
        ],
      },
    ],
  });
  const config = new CancelUndelegateAmountConfig(
    {} as any,
    {
      get: () => ({
        cosmos: {
          queryUnbondingDelegations: { getQueryBech32Address: () => query },
        },
      }),
    } as any,
    "epix_1916-1",
    { sender: "sender" } as any,
    "validator",
    "9007199254740993"
  );
  expect(config.uiProperties.loadingState).toBe("loading-block");
  runInAction(() => {
    query.response = {};
  });
  expect(config.uiProperties.error).toBeUndefined();
  expect(config.amount[0].toDec().toString()).toBe("1.000000000000000001");
  runInAction(() => {
    query.unbondingBalances[0].entries[0].balance = new CoinPretty(
      currency,
      "1"
    );
  });
  expect(config.amount[0].toDec().toString()).toBe("0.000000000000000001");
  config.setEntry("validator", "12");
  expect(config.amount[0].toDec().toString()).toBe("9.000000000000000000");
  runInAction(() => {
    query.unbondingBalances[0].entries = [];
  });
  expect(config.uiProperties.error).toBeDefined();
  expect(config.amount).toHaveLength(0);
});
