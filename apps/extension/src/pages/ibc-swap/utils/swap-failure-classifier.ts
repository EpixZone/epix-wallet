export type SwapErrorSource =
  | "quote"
  | "sign"
  | "submit"
  | "history"
  | "resume"
  | "unknown";

export type SwapErrorCategory =
  | "route_not_found"
  | "unsupported_chain"
  | "unsupported_token"
  | "liquidity_or_amount"
  | "price_impact"
  | "provider_fetch_or_timeout"
  | "rpc_or_network"
  | "gas_or_fee"
  | "user_rejected_or_cancelled"
  | "tx_execution_failed"
  | "unknown";

export type SwapErrorOwnerSurface =
  | "route_coverage"
  | "provider"
  | "chain_support"
  | "token_metadata"
  | "wallet_tx"
  | "user_action"
  | "infra"
  | "unknown";

export type SwapFailureDiagnostics = {
  error_source: SwapErrorSource;
  error_category: SwapErrorCategory;
  error_owner_surface: SwapErrorOwnerSurface;
  failure_code: string;
  is_retriable: boolean;
  is_user_actionable: boolean;
};

export function classifySwapFailure(
  error: unknown,
  errorSource: SwapErrorSource = "unknown"
): SwapFailureDiagnostics {
  const message = getErrorMessage(error).toLowerCase();

  if (message.includes("request rejected")) {
    return createDiagnostics(
      errorSource === "unknown" ? "sign" : errorSource,
      "user_rejected_or_cancelled",
      "user_action",
      "USER_REJECTED",
      {
        isRetriable: true,
        isUserActionable: true,
      }
    );
  }

  if (
    matchesAny(message, [
      "no route",
      "route not found",
      "failed to get route",
      "could not find route",
    ])
  ) {
    return createDiagnostics(
      "quote",
      "route_not_found",
      "route_coverage",
      "ROUTE_NOT_FOUND",
      {
        isRetriable: false,
        isUserActionable: false,
      }
    );
  }

  if (matchesAny(message, ["unsupported chain", "chain not supported"])) {
    return createDiagnostics(
      "quote",
      "unsupported_chain",
      "chain_support",
      "UNSUPPORTED_CHAIN",
      {
        isRetriable: false,
        isUserActionable: false,
      }
    );
  }

  if (matchesAny(message, ["unsupported token", "denom not supported"])) {
    return createDiagnostics(
      "quote",
      "unsupported_token",
      "token_metadata",
      "UNSUPPORTED_TOKEN",
      {
        isRetriable: false,
        isUserActionable: false,
      }
    );
  }

  if (message.includes("insufficient funds")) {
    return createDiagnostics(
      errorSource,
      "liquidity_or_amount",
      "user_action",
      "INSUFFICIENT_FUNDS",
      {
        isRetriable: true,
        isUserActionable: true,
      }
    );
  }

  if (
    matchesAny(message, [
      "insufficient liquidity",
      "amount too low",
      "amount too high",
    ])
  ) {
    return createDiagnostics(
      errorSource,
      "liquidity_or_amount",
      "provider",
      "LIQUIDITY_OR_AMOUNT",
      {
        isRetriable: true,
        isUserActionable: true,
      }
    );
  }

  if (
    matchesAny(message, [
      "price impact",
      "price slippage",
      "slippage tolerance",
    ])
  ) {
    return createDiagnostics(
      errorSource,
      "price_impact",
      "provider",
      "PRICE_IMPACT",
      {
        isRetriable: true,
        isUserActionable: true,
      }
    );
  }

  if (message.includes("memo too long")) {
    return createDiagnostics(
      "submit",
      "tx_execution_failed",
      "wallet_tx",
      "MEMO_TOO_LONG",
      {
        isRetriable: false,
        isUserActionable: false,
      }
    );
  }

  if (message.includes("failed to estimate gas")) {
    return createDiagnostics(
      "submit",
      "gas_or_fee",
      "wallet_tx",
      "GAS_ESTIMATION_FAILED",
      {
        isRetriable: true,
        isUserActionable: false,
      }
    );
  }

  if (message.includes("insufficient fee")) {
    return createDiagnostics(
      "submit",
      "gas_or_fee",
      "user_action",
      "INSUFFICIENT_FEE",
      {
        isRetriable: true,
        isUserActionable: true,
      }
    );
  }

  if (matchesAny(message, ["gasprice != maxfeepergas", "eip-1559"])) {
    return createDiagnostics(
      "submit",
      "gas_or_fee",
      "wallet_tx",
      "GAS_OR_FEE",
      {
        isRetriable: false,
        isUserActionable: false,
      }
    );
  }

  if (message.includes("failed to fetch the client chain id")) {
    return createDiagnostics(
      errorSource,
      "provider_fetch_or_timeout",
      "provider",
      "CLIENT_CHAIN_ID_FETCH_FAILED",
      {
        isRetriable: true,
        isUserActionable: false,
      }
    );
  }

  if (
    matchesAny(message, [
      "failed to fetch",
      "failed to get response from",
      "load failed",
      "timeout",
      "timed out",
    ])
  ) {
    return createDiagnostics(
      errorSource,
      errorSource === "quote" ? "provider_fetch_or_timeout" : "rpc_or_network",
      errorSource === "quote" ? "provider" : "infra",
      errorSource === "quote" ? "PROVIDER_FETCH_OR_TIMEOUT" : "RPC_OR_NETWORK",
      {
        isRetriable: true,
        isUserActionable: false,
      }
    );
  }

  if (message.includes("account sequence mismatch")) {
    return createDiagnostics(
      "submit",
      "tx_execution_failed",
      "wallet_tx",
      "ACCOUNT_SEQUENCE_MISMATCH",
      {
        isRetriable: true,
        isUserActionable: false,
      }
    );
  }

  if (message.includes("ledger") || message.includes("ethereum app")) {
    return createDiagnostics(
      "sign",
      "tx_execution_failed",
      "user_action",
      "LEDGER_SIGNING_UNSUPPORTED",
      {
        isRetriable: false,
        isUserActionable: true,
      }
    );
  }

  if (message.includes("transaction confirmation failed")) {
    return createDiagnostics(
      "submit",
      "tx_execution_failed",
      "wallet_tx",
      "TX_CONFIRMATION_FAILED",
      {
        isRetriable: true,
        isUserActionable: false,
      }
    );
  }

  return createDiagnostics(
    errorSource,
    "unknown",
    "unknown",
    "UNKNOWN_SWAP_FAILURE",
    {
      isRetriable: true,
      isUserActionable: false,
    }
  );
}

function createDiagnostics(
  errorSource: SwapErrorSource,
  errorCategory: SwapErrorCategory,
  errorOwnerSurface: SwapErrorOwnerSurface,
  failureCode: string,
  options: {
    isRetriable: boolean;
    isUserActionable: boolean;
  }
): SwapFailureDiagnostics {
  return {
    error_source: errorSource,
    error_category: errorCategory,
    error_owner_surface: errorOwnerSurface,
    failure_code: failureCode,
    is_retriable: options.isRetriable,
    is_user_actionable: options.isUserActionable,
  };
}

function matchesAny(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => message.includes(pattern));
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return "";
}
