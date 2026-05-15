import { MemoryKVStore } from "@keplr-wallet/common";
import { ChainGetter, QuerySharedContext } from "@keplr-wallet/stores";
import {
  ObservableQueryEthereumERC20BalanceImpl,
  ObservableQueryEthereumERC20BalanceRegistry,
} from "./erc20-balance";

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
  const map = jest.requireActual("../../../stores/src/common/map");
  return {
    QuerySharedContext: context.QuerySharedContext,
    ObservableJsonRPCQuery: jsonRpc.ObservableJsonRPCQuery,
    HasMapStore: map.HasMapStore,
    getKeplrFromWindow: jest.fn(),
  };
});

const ADDRESS = "0x0000000000000000000000000000000000000001";
const CONTRACT = "0x0000000000000000000000000000000000000002";
const DENOM = `erc20:${CONTRACT}`;
const CURRENCY = {
  coinMinimalDenom: DENOM,
  coinDenom: "TEST",
  coinDecimals: 18,
};

describe("ObservableQueryEthereumERC20BalanceRegistry", () => {
  it("keeps ethermint ERC20 balances on the shared batch query for hex senders", () => {
    const batchParentStore = mockBatchParentStore();
    const chainGetter = mockChainGetter("ethermint");
    const registry = createRegistry(batchParentStore);

    const impl = registry.getBalanceImpl(
      "injective-1",
      chainGetter,
      ADDRESS,
      DENOM
    );

    expect(impl).toBeInstanceOf(ObservableQueryEthereumERC20BalanceImpl);
    expect(batchParentStore.getOrCreate).toHaveBeenCalledWith(
      "injective-1",
      chainGetter,
      ADDRESS
    );
  });

  it("keeps pure EVM ERC20 balances on the shared batch query", () => {
    const batchParentStore = mockBatchParentStore();
    const chainGetter = mockChainGetter("evm");
    const registry = createRegistry(batchParentStore);

    const impl = registry.getBalanceImpl(
      "eip155:1",
      chainGetter,
      ADDRESS,
      DENOM
    );

    expect(impl).toBeInstanceOf(ObservableQueryEthereumERC20BalanceImpl);
    expect(batchParentStore.getOrCreate).toHaveBeenCalledWith(
      "eip155:1",
      chainGetter,
      ADDRESS
    );
  });
});

function createRegistry(
  batchParentStore: ReturnType<typeof mockBatchParentStore>
) {
  return new ObservableQueryEthereumERC20BalanceRegistry(
    new QuerySharedContext(new MemoryKVStore("erc20-balance-registry-test"), {
      responseDebounceMs: 0,
    }),
    batchParentStore as any
  );
}

function mockBatchParentStore() {
  return {
    getOrCreate: jest.fn(() => ({
      addContract: jest.fn(),
      removeContract: jest.fn(),
      waitFreshResponse: jest.fn(),
      getBalance: jest.fn(),
      getError: jest.fn(),
      isFetching: false,
    })),
  };
}

function mockChainGetter(type: "evm" | "ethermint"): ChainGetter {
  return {
    getModularChain() {
      return {
        type,
        unwrapped: {
          type,
          evm: {
            rpc: "https://rpc.example",
          },
        },
        currencies: [CURRENCY],
        forceFindCurrency(denom: string) {
          if (denom === DENOM) {
            return CURRENCY;
          }
          throw new Error(`Unknown currency: ${denom}`);
        },
      } as ReturnType<ChainGetter["getModularChain"]>;
    },
    hasModularChain() {
      return true;
    },
  };
}
