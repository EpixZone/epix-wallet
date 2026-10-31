import { EthereumProviderRpcError } from "@keplr-wallet/router";
import { JsonRpcResponse } from "@keplr-wallet/types";

export const validateEVMChainId = (evmChainId: number) => {
  const isSafeEVMChainId =
    Number.isSafeInteger(evmChainId) &&
    evmChainId > 0 &&
    // The largest possible EVM chain ID.
    // Reference: https://gist.github.com/rekmarks/a47bd5f2525936c4b8eee31a16345553
    evmChainId <= 4503599627370476;
  if (!isSafeEVMChainId) {
    throw new Error(
      "EVM chain ID must be greater than 0 and lower than 4503599627370476."
    );
  }

  return evmChainId;
};

const nullableRpcMethods = new Set([
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
]);

export const unwrapEthereumRpcResponse = <T>(
  response: JsonRpcResponse<T>,
  method: string
): T => {
  const invalidResponse = () =>
    new EthereumProviderRpcError(
      -32603,
      `Invalid JSON-RPC response for ${method}`
    );

  if (!response || typeof response !== "object") {
    throw invalidResponse();
  }

  // EIP-1193 callers need the node's error, including revert data. Returning
  // an absent result instead turns a failed estimate into a numeric parse error.
  if (response.error != null) {
    const { code, message, data } = response.error;
    if (!Number.isInteger(code) || typeof message !== "string") {
      throw invalidResponse();
    }
    throw new EthereumProviderRpcError(code, message, data);
  }

  if (
    !Object.prototype.hasOwnProperty.call(response, "result") ||
    response.result === undefined ||
    (response.result === null && !nullableRpcMethods.has(method))
  ) {
    throw invalidResponse();
  }

  return response.result;
};
