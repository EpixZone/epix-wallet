import { DenomHelper } from "@keplr-wallet/common";
import { AppCurrency } from "@keplr-wallet/types";
import {
  ObservableQueryThirdpartyERC20BalanceRegistry,
  ObservableQueryThirdpartyERC20BalancesImpl,
} from "./erc20-balances";

jest.mock("../account", () => ({
  EthereumAccountBase: {
    isEthereumHexAddressWithChecksum: jest.fn(() => true),
  },
}));

jest.mock("@keplr-wallet/stores", () => {
  const context = jest.requireActual(
    "../../../stores/src/common/query/context"
  );
  const jsonRpc = jest.requireActual(
    "../../../stores/src/common/query/json-rpc"
  );
  const batch = jest.requireActual(
    "../../../stores/src/common/query/json-rpc-batch"
  );
  return {
    QuerySharedContext: context.QuerySharedContext,
    ObservableJsonRPCQuery: jsonRpc.ObservableJsonRPCQuery,
    ObservableJsonRpcBatchQuery: batch.ObservableJsonRpcBatchQuery,
  };
});

const CONTRACT = "0x0000000000000000000000000000000000000002";
const DENOM = `erc20:${CONTRACT}`;
const CURRENCY: AppCurrency = {
  coinMinimalDenom: DENOM,
  coinDenom: "TEST",
  coinDecimals: 18,
};

describe("ObservableQueryThirdpartyERC20BalancesImpl", () => {
  it("falls back to batch eth_call for a missing token when the Alchemy response is complete", async () => {
    const { parent, batchParent } = mockParent({
      address: "0x0000000000000000000000000000000000000001",
      tokenBalances: [],
    });
    batchParent.waitFreshResponse.mockImplementation(async () => {
      batchParent.getBalance.mockReturnValue("0x5");
    });
    const balance = createBalance(parent);

    await balance.fetch();

    expect(batchParent.addContract).toHaveBeenCalledWith(CONTRACT);
    expect(batchParent.waitFreshResponse).toHaveBeenCalledTimes(1);
    expect(batchParent.removeContract).toHaveBeenCalledWith(CONTRACT);
    expect(balance.response).not.toBe(parent.response);
    expect(balance.balance.isReady).toBe(true);
    expect(balance.balance.toCoin().amount).toBe("5");
  });

  it("uses the batch parent's cached balance when complete Alchemy response omits the token", async () => {
    const { parent, batchParent } = mockParent({
      address: "0x0000000000000000000000000000000000000001",
      tokenBalances: [],
    });
    batchParent.getBalance.mockReturnValue("0x5");
    const balance = createBalance(parent);

    await balance.fetch();

    expect(batchParent.addContract).toHaveBeenCalledWith(CONTRACT);
    expect(balance.balance.toCoin().amount).toBe("5");
  });

  it("falls back to batch eth_call for a missing token when Alchemy has more pages", async () => {
    const { parent, batchParent } = mockParent({
      address: "0x0000000000000000000000000000000000000001",
      tokenBalances: [],
      pageKey: "next-page",
    });
    const balance = createBalance(parent);

    await balance.fetch();

    expect(batchParent.addContract).toHaveBeenCalledWith(CONTRACT);
    expect(batchParent.waitFreshResponse).toHaveBeenCalledTimes(1);
    expect(batchParent.removeContract).toHaveBeenCalledWith(CONTRACT);
  });
});

describe("ObservableQueryThirdpartyERC20BalanceRegistry", () => {
  it("does not use the Keplr Alchemy proxy for Optimism", () => {
    const batchParentStore = {
      getOrCreate: jest.fn(),
    };
    const registry = new ObservableQueryThirdpartyERC20BalanceRegistry(
      {} as any,
      batchParentStore as any
    );

    const impl = registry.getBalanceImpl(
      "eip155:10",
      mockChainGetter(),
      "0x0000000000000000000000000000000000000001",
      DENOM
    );

    expect(impl).toBeUndefined();
    expect(batchParentStore.getOrCreate).not.toHaveBeenCalled();
  });
});

function createBalance(
  parent: ReturnType<typeof mockParent>["parent"]
): ObservableQueryThirdpartyERC20BalancesImpl {
  return new ObservableQueryThirdpartyERC20BalancesImpl(
    parent as any,
    "eip155:1",
    mockChainGetter(),
    new DenomHelper(DENOM)
  );
}

function mockParent(data: {
  address: string;
  tokenBalances: {
    contractAddress: string;
    tokenBalance: string | null;
    error: { code: number; message: string } | null;
  }[];
  pageKey?: string;
}) {
  const batchParent = {
    addContract: jest.fn(),
    removeContract: jest.fn(),
    waitFreshResponse: jest.fn().mockResolvedValue(undefined),
    getBalance: jest.fn(),
    getLastKnownBalance: jest.fn(),
    getError: jest.fn(),
    isFetchingContract: jest.fn(() => false),
    isFetching: false,
  };
  const response = {
    data,
    staled: false,
    local: false,
    timestamp: 0,
  };
  const parent = {
    response,
    error: undefined,
    batchParent,
    duplicatedFetchResolver: undefined as Promise<void> | undefined,
    fetch: jest.fn().mockResolvedValue(undefined),
    hasAlchemyBalance(contract: string) {
      return data.tokenBalances.some(
        (bal) =>
          bal.contractAddress.toLowerCase() === contract.toLowerCase() &&
          bal.tokenBalance != null
      );
    },
    getAlchemyTokenBalance(contract: string) {
      return data.tokenBalances.find(
        (bal) => bal.contractAddress.toLowerCase() === contract.toLowerCase()
      );
    },
    resolvesAlchemyBalance(contract: string) {
      return this.getAlchemyTokenBalance(contract)?.tokenBalance != null;
    },
    isFetching: false,
    isObserved: false,
    isStarted: false,
  };

  return { parent, batchParent };
}

function mockChainGetter() {
  return {
    getModularChain() {
      return {
        currencies: [CURRENCY],
        forceFindCurrency(denom: string) {
          if (denom === DENOM) {
            return CURRENCY;
          }
          throw new Error(`Unknown currency: ${denom}`);
        },
      };
    },
    hasModularChain() {
      return true;
    },
  } as any;
}
