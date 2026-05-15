import { MemoryKVStore } from "@keplr-wallet/common";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { ChainGetter, QuerySharedContext } from "@keplr-wallet/stores";
import { autorun } from "mobx";
import { ObservableQueryEthereumERC20BalancesBatchParent } from "./erc20-balance-batch";

jest.mock("@keplr-wallet/stores", () => {
  const context = jest.requireActual(
    "../../../stores/src/common/query/context"
  );
  const batch = jest.requireActual(
    "../../../stores/src/common/query/json-rpc-batch"
  );
  return {
    QuerySharedContext: context.QuerySharedContext,
    ObservableJsonRpcBatchQuery: batch.ObservableJsonRpcBatchQuery,
  };
});

jest.mock("@keplr-wallet/simple-fetch", () => {
  const actual = jest.requireActual("@keplr-wallet/simple-fetch");
  return {
    ...actual,
    simpleFetch: jest.fn(),
  };
});

const ADDRESS = "0x0000000000000000000000000000000000000001";
const CONTRACT_A = "0x0000000000000000000000000000000000000002";
const CONTRACT_B = "0x0000000000000000000000000000000000000003";

type PendingFetch = {
  body: { id: string }[];
  resolve: (value: { headers: Record<string, unknown>; data: unknown }) => void;
};

describe("ObservableQueryEthereumERC20BalancesBatchParent", () => {
  let pendingFetches: PendingFetch[];

  beforeEach(() => {
    pendingFetches = [];
    (simpleFetch as jest.Mock).mockImplementation(
      (_baseURL: string, _url: string, options: { body: string }) => {
        return new Promise((resolve) => {
          pendingFetches.push({
            body: JSON.parse(options.body),
            resolve: resolve as PendingFetch["resolve"],
          });
        });
      }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("keeps the last known contract balance while the batch layout is rebuilt", async () => {
    const parent = new ObservableQueryEthereumERC20BalancesBatchParent(
      new QuerySharedContext(new MemoryKVStore("erc20-balance-batch-test"), {
        responseDebounceMs: 0,
      }),
      "eip155:1",
      mockChainGetter(),
      ADDRESS
    );

    parent.addContract(CONTRACT_A);
    const firstWait = parent.waitFreshResponse();
    await waitForPendingFetches(pendingFetches, 1);
    resolveFetch(pendingFetches[0], {
      [CONTRACT_A]: "0x1",
    });
    await firstWait;

    expect(parent.getBalance(CONTRACT_A)).toBe("0x1");

    parent.addContract(CONTRACT_B);
    const secondWait = parent.waitFreshResponse();
    await waitForPendingFetches(pendingFetches, 2);

    expect(parent.getBalance(CONTRACT_A)).toBe("0x1");

    resolveFetch(pendingFetches[1], {
      [CONTRACT_A]: "0x2",
      [CONTRACT_B]: "0x3",
    });
    await secondWait;

    expect(parent.getBalance(CONTRACT_A)).toBe("0x2");
    expect(parent.getBalance(CONTRACT_B)).toBe("0x3");
  });

  it("starts a rebuilt query while serving a last known balance", async () => {
    const parent = new ObservableQueryEthereumERC20BalancesBatchParent(
      new QuerySharedContext(new MemoryKVStore("erc20-balance-batch-test"), {
        responseDebounceMs: 0,
      }),
      "eip155:1",
      mockChainGetter(),
      ADDRESS
    );

    parent.addContract(CONTRACT_A);
    const firstWait = parent.waitFreshResponse();
    await waitForPendingFetches(pendingFetches, 1);
    resolveFetch(pendingFetches[0], {
      [CONTRACT_A]: "0x1",
    });
    await firstWait;

    parent.removeContract(CONTRACT_A);
    await wait(250);
    parent.addContract(CONTRACT_A);
    await wait(250);

    const disposers = [
      autorun(() => parent.getBalance(CONTRACT_A)),
      autorun(() => parent.getError(CONTRACT_A)),
      autorun(() => parent.isFetchingContract(CONTRACT_A)),
    ];

    await waitForPendingFetches(pendingFetches, 2);

    expect(parent.getBalance(CONTRACT_A)).toBe("0x1");

    resolveFetch(pendingFetches[1], {
      [CONTRACT_A]: "0x2",
    });
    await waitForCondition(() => parent.getBalance(CONTRACT_A) === "0x2");

    expect(parent.getBalance(CONTRACT_A)).toBe("0x2");

    disposers.forEach((dispose) => dispose());
  });
});

function mockChainGetter(): ChainGetter {
  return {
    getModularChain() {
      return {
        unwrapped: {
          type: "evm",
          evm: {
            rpc: "https://rpc.example",
          },
        },
      } as ReturnType<ChainGetter["getModularChain"]>;
    },
    hasModularChain() {
      return true;
    },
  };
}

function resolveFetch(fetch: PendingFetch, results: Record<string, string>) {
  fetch.resolve({
    headers: {},
    data: fetch.body.map((req) => ({
      jsonrpc: "2.0",
      id: req.id,
      result: results[req.id] ?? "0x0",
    })),
  });
}

async function waitForPendingFetches(
  pendingFetches: PendingFetch[],
  count: number
) {
  const startedAt = Date.now();
  while (pendingFetches.length < count) {
    if (Date.now() - startedAt > 2000) {
      throw new Error(`Timed out waiting for ${count} fetches`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(fn: () => boolean) {
  const startedAt = Date.now();
  while (!fn()) {
    if (Date.now() - startedAt > 2000) {
      throw new Error("Timed out waiting for condition");
    }
    await wait(10);
  }
}
