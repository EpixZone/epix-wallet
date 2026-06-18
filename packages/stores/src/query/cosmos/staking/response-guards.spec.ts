import { MemoryKVStore } from "@keplr-wallet/common";
import { QuerySharedContext, QueryResponse } from "../../../common";
import { ChainGetter } from "../../../chain";
import { ObservableQueryDelegationsInner } from "./delegations";
import { ObservableQueryInitiaDelegationsInner } from "./initia-delegations";
import { ObservableQueryInitiaUnbondingDelegationsInner } from "./initia-unbonding-delegations";
import {
  assertDelegationsResponse,
  assertRewardsResponse,
  assertUnbondingDelegationsResponse,
  getDelegationResponses,
  getInitiaDelegationResponses,
  getInitiaUnbondingResponses,
  getRewardsResponse,
  getUnbondingResponses,
} from "./types";

const stakeCurrency = {
  coinDenom: "ATOM",
  coinMinimalDenom: "uatom",
  coinDecimals: 6,
};

const chainGetter: ChainGetter = {
  getModularChain: () =>
    ({
      chainId: "cosmoshub-4",
      type: "cosmos",
      unwrapped: {
        type: "cosmos",
        cosmos: {
          stakeCurrency,
        },
      },
    } as any),
  hasModularChain: () => true,
};

const initiaStakeCurrency = {
  coinDenom: "INIT",
  coinMinimalDenom: "uinit",
  coinDecimals: 6,
};

const initiaChainGetter: ChainGetter = {
  getModularChain: () =>
    ({
      chainId: "interwoven-1",
      type: "cosmos",
      unwrapped: {
        type: "cosmos",
        cosmos: {
          stakeCurrency: initiaStakeCurrency,
        },
      },
    } as any),
  hasModularChain: () => true,
};

const initiaDelegationResponse = {
  delegation_responses: [
    {
      delegation: {
        delegator_address: "init10alvsy3f0a6vsr7ghjh3rtygrhygavsk3tscgz",
        validator_address: "initvaloper1validator",
        shares: [
          {
            denom: "uinit",
            amount: "990000.000000000000000000",
          },
        ],
      },
      balance: [
        {
          denom: "uinit",
          amount: "990000",
        },
      ],
    },
    {
      delegation: {
        delegator_address: "init10alvsy3f0a6vsr7ghjh3rtygrhygavsk3tscgz",
        validator_address: "initvaloper1validator2",
        shares: [
          {
            denom: "uinit",
            amount: "200000.000000000000000000",
          },
        ],
      },
      balance: [
        {
          denom: "uinit",
          amount: "200000",
        },
      ],
    },
  ],
};

const initiaUnbondingDelegationResponse = {
  unbonding_responses: [
    {
      delegator_address: "init10alvsy3f0a6vsr7ghjh3rtygrhygavsk3tscgz",
      validator_address: "initvaloper1validator",
      entries: [
        {
          creation_height: "123",
          completion_time: "2026-01-01T00:00:00Z",
          initial_balance: [
            {
              denom: "uinit",
              amount: "300000",
            },
          ],
          balance: [
            {
              denom: "uinit",
              amount: "200000",
            },
          ],
        },
      ],
    },
  ],
};

class TestDelegationsQuery extends ObservableQueryDelegationsInner {
  setTestResponse(data: unknown) {
    this.setResponse({
      data,
      staled: false,
      local: true,
      timestamp: Date.now(),
    } as QueryResponse<any>);
  }
}

class TestInitiaDelegationsQuery extends ObservableQueryInitiaDelegationsInner {
  setTestResponse(data: unknown) {
    this.setResponse({
      data,
      staled: false,
      local: true,
      timestamp: Date.now(),
    } as QueryResponse<any>);
  }
}

class TestInitiaUnbondingDelegationsQuery extends ObservableQueryInitiaUnbondingDelegationsInner {
  setTestResponse(data: unknown) {
    this.setResponse({
      data,
      staled: false,
      local: true,
      timestamp: Date.now(),
    } as QueryResponse<any>);
  }
}

describe("staking response guards", () => {
  test("rejects malformed delegation responses", () => {
    expect(getDelegationResponses("")).toBeUndefined();
    expect(getDelegationResponses({})).toBeUndefined();
    expect(
      getDelegationResponses({
        delegation_responses: [
          {
            delegation: {
              delegator_address: "cosmos1delegator",
              validator_address: "cosmosvaloper1validator",
              shares: "1.0",
            },
            balance: {
              denom: "uatom",
              amount: "123",
            },
          },
        ],
      })
    ).toHaveLength(1);

    expect(() => assertDelegationsResponse("")).toThrow(
      "Invalid Cosmos staking delegations response"
    );
  });

  test("rejects malformed unbonding delegation responses", () => {
    expect(getUnbondingResponses("")).toBeUndefined();
    expect(getUnbondingResponses({})).toBeUndefined();
    expect(
      getUnbondingResponses({
        unbonding_responses: [
          {
            delegator_address: "cosmos1delegator",
            validator_address: "cosmosvaloper1validator",
            entries: [
              {
                creation_height: "1",
                completion_time: "2026-01-01T00:00:00Z",
                initial_balance: "123",
                balance: "123",
              },
            ],
          },
        ],
      })
    ).toHaveLength(1);

    expect(() => assertUnbondingDelegationsResponse("")).toThrow(
      "Invalid Cosmos staking unbonding delegations response"
    );
  });

  test("accepts Initia delegation responses with coin-array shares", () => {
    expect(getInitiaDelegationResponses(initiaDelegationResponse)).toHaveLength(
      2
    );

    expect(
      getInitiaDelegationResponses({
        delegation_responses: [
          {
            delegation: {
              delegator_address: "init10alvsy3f0a6vsr7ghjh3rtygrhygavsk3tscgz",
              validator_address: "initvaloper1validator",
              shares: [
                {
                  denom: "uinit",
                  amount: 990000,
                },
              ],
            },
            balance: [
              {
                denom: "uinit",
                amount: "990000",
              },
            ],
          },
        ],
      })
    ).toBeUndefined();
  });

  test("Initia delegation getters total coin-array balances", () => {
    const query = new TestInitiaDelegationsQuery(
      new QuerySharedContext(new MemoryKVStore("test"), {
        responseDebounceMs: 10,
      }),
      "interwoven-1",
      initiaChainGetter,
      "init10alvsy3f0a6vsr7ghjh3rtygrhygavsk3tscgz"
    );

    query.setTestResponse(initiaDelegationResponse);

    expect(query.total?.toCoin()).toEqual({
      denom: "uinit",
      amount: "1190000",
    });
    expect(query.delegationBalances).toHaveLength(2);
    expect(query.delegations[0].delegation.shares).toBe(
      "990000.000000000000000000"
    );
  });

  test("accepts Initia unbonding responses with coin-array balances", () => {
    expect(
      getInitiaUnbondingResponses(initiaUnbondingDelegationResponse)
    ).toHaveLength(1);

    expect(
      getInitiaUnbondingResponses({
        unbonding_responses: [
          {
            delegator_address: "init10alvsy3f0a6vsr7ghjh3rtygrhygavsk3tscgz",
            validator_address: "initvaloper1validator",
            entries: [
              {
                creation_height: "123",
                completion_time: "2026-01-01T00:00:00Z",
                initial_balance: "300000",
                balance: [
                  {
                    denom: "uinit",
                    amount: "200000",
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toBeUndefined();
  });

  test("Initia unbonding getters total and normalize coin-array balances", () => {
    const query = new TestInitiaUnbondingDelegationsQuery(
      new QuerySharedContext(new MemoryKVStore("test"), {
        responseDebounceMs: 10,
      }),
      "interwoven-1",
      initiaChainGetter,
      "init10alvsy3f0a6vsr7ghjh3rtygrhygavsk3tscgz"
    );

    query.setTestResponse(initiaUnbondingDelegationResponse);

    expect(query.total?.toCoin()).toEqual({
      denom: "uinit",
      amount: "200000",
    });
    expect(query.unbondings[0].entries[0].initial_balance).toBe("300000");
    expect(query.unbondings[0].entries[0].balance).toBe("200000");
  });

  test("rejects malformed reward responses without coercing values", () => {
    expect(getRewardsResponse("")).toBeUndefined();
    expect(
      getRewardsResponse({
        rewards: [
          {
            validator_address: "cosmosvaloper1validator",
            reward: [
              {
                denom: "uatom",
                amount: "1.5",
              },
            ],
          },
        ],
        total: [
          {
            denom: "uatom",
            amount: "1.5",
          },
        ],
      })
    ).toBeDefined();
    expect(
      getRewardsResponse({
        rewards: [
          {
            validator_address: "cosmosvaloper1validator",
            reward: [
              {
                denom: "uatom",
                amount: 1.5,
              },
            ],
          },
        ],
      })
    ).toBeUndefined();

    expect(() => assertRewardsResponse("")).toThrow(
      "Invalid Cosmos distribution rewards response"
    );
  });

  test("delegation getters tolerate malformed cached responses", () => {
    const query = new TestDelegationsQuery(
      new QuerySharedContext(new MemoryKVStore("test"), {
        responseDebounceMs: 10,
      }),
      "cosmoshub-4",
      chainGetter,
      "cosmos1delegator"
    );

    query.setTestResponse("");

    expect(() => query.total).not.toThrow();
    expect(query.delegationBalances).toEqual([]);
    expect(query.delegations).toEqual([]);
  });
});
