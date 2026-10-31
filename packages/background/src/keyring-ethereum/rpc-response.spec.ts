import { KeyRingEthereumService } from "./service";
import { Env, EthereumProviderRpcError } from "@keplr-wallet/router";
import { simpleFetch } from "@keplr-wallet/simple-fetch";

jest.mock("../keyring-cosmos", () => ({}));
jest.mock("@keplr-wallet/simple-fetch", () => ({ simpleFetch: jest.fn() }));

const chainId = "epix_1916-1";
const rpc = "https://rpc.test";

function provider() {
  return new KeyRingEthereumService(
    {
      getEVMInfoOrThrow: () => ({ rpc }),
      getModularChainInfoOrThrow: () => ({
        type: "ethermint",
        chainId,
        evm: { rpc },
      }),
    } as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any
  );
}

function request(method: string, response: unknown) {
  (simpleFetch as jest.Mock).mockReset().mockResolvedValue({ data: response });
  return provider().request(
    { isInternalMsg: true } as Env,
    "https://dapp.test",
    method,
    [],
    undefined,
    chainId
  );
}

it.each([
  "eth_estimateGas",
  "eth_call",
  "eth_getTransactionCount",
  "eth_sendRawTransaction",
  "eth_getTransactionReceipt",
])(
  "preserves RPC errors from %s instead of returning an empty result",
  async (method) => {
    const error = {
      code: -32000,
      message: "execution reverted",
      data: "0x08c379a0",
    };
    const pending = request(method, { jsonrpc: "2.0", id: 1, error });
    await expect(pending).rejects.toBeInstanceOf(EthereumProviderRpcError);
    await expect(pending).rejects.toMatchObject(error);
  }
);

it("keeps the insufficient-funds reason returned by Epix when estimating a tip", async () => {
  await expect(
    request("eth_estimateGas", {
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32000,
        message:
          "rpc error: code = Unknown desc = insufficient balance for transfer",
      },
    })
  ).rejects.toMatchObject({
    code: -32000,
    message:
      "rpc error: code = Unknown desc = insufficient balance for transfer",
  });
});

it.each([
  undefined,
  null,
  "not JSON-RPC",
  {},
  { error: {} },
  { error: { code: "-32000", message: "invalid" } },
  { error: { code: -32000, message: { secret: "request detail" } } },
  { result: undefined },
  { result: null },
])(
  "rejects malformed estimate responses without treating them as gas values: %p",
  async (response) => {
    await expect(request("eth_estimateGas", response)).rejects.toMatchObject({
      code: -32603,
      message: "Invalid JSON-RPC response for eth_estimateGas",
    });
  }
);

it.each([
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
])("preserves the valid not-found result from %s", async (method) => {
  await expect(request(method, { result: null })).resolves.toBeNull();
});

it.each([
  ["eth_estimateGas", "0x5208"],
  ["eth_getTransactionCount", "0x0"],
  ["eth_syncing", false],
  ["eth_getLogs", []],
  ["eth_getTransactionReceipt", { transactionHash: "0x1234", status: "0x1" }],
])("preserves successful %s results", async (method, result) => {
  await expect(request(method as string, { result })).resolves.toEqual(result);
});

it("rejects an RPC error even when the server also includes a null result", async () => {
  await expect(
    request("eth_getTransactionReceipt", {
      result: null,
      error: { code: -32005, message: "request limit exceeded" },
    })
  ).rejects.toMatchObject({ code: -32005, message: "request limit exceeded" });
});
