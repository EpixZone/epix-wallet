import { CosmosAccountImpl, defaultCosmosMsgOpts } from "./cosmos";
import { ChainStore } from "../chain";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { MsgCancelUnbondingDelegation } from "@keplr-wallet/proto-types/cosmos/staking/v1beta1/tx";

const address = new Bech32Address(new Uint8Array(20).fill(1));
const validator = address.toBech32("epixvaloper");
const sender = address.toBech32("epix");
const currency = {
  coinDenom: "EPIX",
  coinMinimalDenom: "aepix",
  coinDecimals: 18,
};

function setup() {
  const chainGetter = new ChainStore([
    {
      chainId: "epix_1916-1",
      chainName: "Epix",
      rpc: "http://localhost",
      rest: "http://localhost",
      bip44: { coinType: 60 },
      bech32Config: Bech32Address.defaultBech32Config("epix"),
      currencies: [currency],
      feeCurrencies: [currency],
      stakeCurrency: currency,
    },
  ]);
  const query = {
    unbondings: [
      {
        validator_address: validator,
        entries: [
          {
            creation_height: "9007199254740993",
            completion_time: "2099-01-01T00:00:00Z",
            balance: "1000000000000000001",
            initial_balance: "2000000000000000000",
          },
        ],
      },
    ],
  };
  const fetch = jest.fn();
  const byAddress = { getQueryBech32Address: () => ({ ...query, fetch }) };
  const queries = {
    cosmos: {
      queryUnbondingDelegations: byAddress,
      queryDelegations: byAddress,
      queryRewards: byAddress,
      queryValidators: { getQueryStatus: () => ({ fetch }) },
    },
  };
  const account = new CosmosAccountImpl(
    { bech32Address: sender, registerMakeSendTokenFn() {} } as any,
    chainGetter,
    "epix_1916-1",
    { get: () => queries } as any,
    defaultCosmosMsgOpts,
    {}
  );
  const make = jest
    .spyOn(account as any, "makeTx")
    .mockImplementation((...args: unknown[]) => ({
      messages: args[1],
      fulfill: args[2],
    }));
  return { account, make, fetch, query };
}

test("cancellation encodes an exact entry height and remaining amount in both signing modes", async () => {
  const { account, fetch } = setup();
  const tx: any = account.makeCancelUndelegateTx(
    "1.000000000000000001",
    validator,
    "9007199254740993"
  );
  const messages = await tx.messages();
  const amino = messages.aminoMsgs[0];
  expect(amino.type).toBe("cosmos-sdk/MsgCancelUnbondingDelegation");
  expect(amino.value.creation_height).toBe("9007199254740993");
  expect(amino.value.amount.amount).toBe("1000000000000000001");
  const decoded = MsgCancelUnbondingDelegation.decode(
    messages.protoMsgs[0].value
  );
  expect(decoded.creationHeight).toBe("9007199254740993");
  expect(decoded.amount?.amount).toBe("1000000000000000001");
  tx.fulfill({ code: 1 });
  expect(fetch).not.toHaveBeenCalled();
  tx.fulfill({ code: 0 });
  expect(fetch).toHaveBeenCalledTimes(4);
});

test("cancellation rejects overdrawn, missing and completed entries", () => {
  const { account, query } = setup();
  expect(() =>
    account.makeCancelUndelegateTx(
      "1.000000000000000002",
      validator,
      "9007199254740993"
    )
  ).toThrow();
  expect(() =>
    account.makeCancelUndelegateTx("0", validator, "9007199254740993")
  ).toThrow();
  expect(() =>
    account.makeCancelUndelegateTx(
      "0.0000000000000000001",
      validator,
      "9007199254740993"
    )
  ).toThrow();
  expect(() => account.makeCancelUndelegateTx("1", validator, "9")).toThrow();
  query.unbondings[0].entries[0].completion_time = "2000-01-01T00:00:00Z";
  expect(() =>
    account.makeCancelUndelegateTx("1", validator, "9007199254740993")
  ).toThrow();
});
