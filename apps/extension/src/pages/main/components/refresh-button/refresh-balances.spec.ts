import {
  BalanceRefreshStores,
  refreshWalletBalances,
} from "./refresh-balances";

function makeQuery(isObserved = true) {
  return {
    isObserved,
    error: undefined as undefined | { message: string },
    waitFreshResponse: jest.fn().mockResolvedValue(undefined),
  };
}

function setup() {
  let address = "epix-first";
  const bank = makeQuery();
  const native = makeQuery();
  const erc20 = makeQuery();
  const unobserved = makeQuery(false);
  const rewards = makeQuery();
  const delegations = makeQuery();
  const unbonding = makeQuery();
  const price = makeQuery();
  const validators = makeQuery();
  const stakingParams = makeQuery();
  const secondBank = makeQuery();
  const secondNative = makeQuery();
  const bech32 = jest.fn((value: string) => ({
    balances: value === "epix-first" ? [bank] : [secondBank],
  }));
  const hex = jest.fn((value: string) => ({
    balances:
      value === "hex-epix-first"
        ? [native, erc20, unobserved, native]
        : [secondNative],
  }));
  const store = {
    chainStore: {
      modularChainInfosInUI: [
        { chainId: "epix_1916-1", unwrapped: { type: "ethermint" } },
      ],
    },
    accountStore: {
      getAccount: () => ({
        bech32Address: address,
        ethereumHexAddress: `hex-${address}`,
      }),
    },
    queriesStore: {
      get: () => ({
        queryBalances: {
          getQueryBech32Address: bech32,
          getQueryEthereumHexAddress: hex,
        },
        cosmos: {
          queryValidators: { getQueryStatus: () => validators },
          queryStakingParams: stakingParams,
          queryRewards: { getQueryBech32Address: () => rewards },
          queryDelegations: { getQueryBech32Address: () => delegations },
          queryUnbondingDelegations: { getQueryBech32Address: () => unbonding },
        },
      }),
    },
    priceStore: price,
  } as unknown as BalanceRefreshStores;
  return {
    store,
    bank,
    native,
    erc20,
    unobserved,
    rewards,
    delegations,
    unbonding,
    price,
    validators,
    stakingParams,
    secondBank,
    secondNative,
    bech32,
    hex,
    selectSecond: () => (address = "epix-second"),
  };
}

it("refreshes observed Ethermint native, ERC20, IBC and staking queries once", async () => {
  const test = setup();
  await refreshWalletBalances(test.store, false);
  for (const query of [
    test.bank,
    test.native,
    test.erc20,
    test.rewards,
    test.delegations,
    test.unbonding,
  ]) {
    expect(query.waitFreshResponse).toHaveBeenCalledTimes(1);
  }
  expect(test.unobserved.waitFreshResponse).not.toHaveBeenCalled();
  expect(test.price.waitFreshResponse).not.toHaveBeenCalled();
  expect(test.bech32).toHaveBeenCalledWith("epix-first");
  expect(test.hex).toHaveBeenCalledWith("hex-epix-first");
});

it("uses current account addresses after switching and includes prices on manual refresh", async () => {
  const test = setup();
  await refreshWalletBalances(test.store, true);
  expect(test.unobserved.waitFreshResponse).toHaveBeenCalledTimes(1);
  expect(test.price.waitFreshResponse).toHaveBeenCalledTimes(1);
  expect(test.validators.waitFreshResponse).toHaveBeenCalledTimes(1);
  expect(test.stakingParams.waitFreshResponse).toHaveBeenCalledTimes(1);
  test.selectSecond();
  await refreshWalletBalances(test.store, false);
  expect(test.secondBank.waitFreshResponse).toHaveBeenCalledTimes(1);
  expect(test.secondNative.waitFreshResponse).toHaveBeenCalledTimes(1);
  expect(test.bank.waitFreshResponse).toHaveBeenCalledTimes(1);
  expect(test.native.waitFreshResponse).toHaveBeenCalledTimes(1);
});

it("waits for other requests after a failure and reports stored query errors", async () => {
  const test = setup();
  let finish: () => void = () => undefined;
  test.bank.waitFreshResponse.mockRejectedValue(new Error("offline"));
  test.native.waitFreshResponse.mockImplementation(
    () => new Promise<void>((resolve) => (finish = resolve))
  );
  let settled = false;
  const result = refreshWalletBalances(test.store, false).catch(
    (error: Error) => {
      settled = true;
      return error;
    }
  );
  await Promise.resolve();
  expect(settled).toBe(false);
  finish();
  expect(await result).toBeInstanceOf(Error);

  test.bank.waitFreshResponse.mockResolvedValue(undefined);
  test.native.waitFreshResponse.mockResolvedValue(undefined);
  test.bank.error = { message: "Failed to get response" };
  await expect(refreshWalletBalances(test.store, false)).rejects.toThrow(
    "could not be refreshed"
  );
});

it("does not poll hidden validator metadata or report unavailable prices as a balance failure", async () => {
  const test = setup();
  test.validators.isObserved = false;
  test.stakingParams.isObserved = false;
  test.price.waitFreshResponse.mockRejectedValue(
    new Error("Price unavailable")
  );
  await expect(
    refreshWalletBalances(test.store, true)
  ).resolves.toBeUndefined();
  expect(test.validators.waitFreshResponse).not.toHaveBeenCalled();
  expect(test.stakingParams.waitFreshResponse).not.toHaveBeenCalled();

  test.price.waitFreshResponse.mockClear();
  test.price.isObserved = false;
  await refreshWalletBalances(test.store, true);
  expect(test.price.waitFreshResponse).not.toHaveBeenCalled();
});
