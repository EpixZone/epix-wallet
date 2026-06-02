import { MakeTxResponse } from "@keplr-wallet/stores";
import { UnsignedEVMTransactionWithErc20Approvals } from "@keplr-wallet/stores-eth";
import { RouteStepType } from "@keplr-wallet/stores-internal";
import { EvmGasSimulationOutcome } from "@keplr-wallet/types";

type GasEstimateContext =
  | "review_simulation"
  | "pre_sign_simulation"
  | "background_fill_unsigned_tx";

type GasEstimateErrorCategory =
  | "allowance_insufficient"
  | "native_balance_insufficient"
  | "execution_reverted"
  | "invalid_calldata"
  | "rpc_unavailable"
  | "unknown";

export interface TxExecutionDiagnostics {
  confirmation_failure_reason?: string;
  gas_estimate_context?: GasEstimateContext;
  gas_estimate_error_category?: GasEstimateErrorCategory;
  has_required_erc20_approval?: boolean;
  has_native_value?: boolean;
  failed_tx_has_required_erc20_approval?: boolean;
  failed_tx_has_native_value?: boolean;
  route_step_kinds?: string[];
  route_bridge_kinds?: string[];
  evm_simulation_outcome?: EvmGasSimulationOutcome;
}

const CONFIRMATION_FAILURE_REASONS = [
  "evm_receipt_missing",
  "evm_receipt_status_failed",
  "evm_trace_error",
  "cosmos_trace_missing",
  "cosmos_trace_error",
  "cosmos_rest_fallback_missing",
  "cosmos_code_nonzero",
] as const;

const GAS_ESTIMATE_CONTEXTS = [
  "review_simulation",
  "pre_sign_simulation",
  "background_fill_unsigned_tx",
] as const;

const GAS_ESTIMATE_ERROR_CATEGORIES = [
  "allowance_insufficient",
  "native_balance_insufficient",
  "execution_reverted",
  "invalid_calldata",
  "rpc_unavailable",
  "unknown",
] as const;

const ROUTE_STEP_KINDS = ["swap", "bridge", "ibc_transfer", "unknown"] as const;

const ROUTE_BRIDGE_KINDS = ["axelar", "cctp", "ibc", "unknown"] as const;

const EVM_SIMULATION_OUTCOMES = [
  EvmGasSimulationOutcome.TX_SIMULATED,
  EvmGasSimulationOutcome.TX_BUNDLE_SIMULATED,
  EvmGasSimulationOutcome.APPROVAL_ONLY_SIMULATED,
] as const;

export function getRouteExecutionDiagnostics(routeResponse: {
  steps?: { type: RouteStepType }[];
  skip_operations?: unknown[];
}): Partial<
  Pick<TxExecutionDiagnostics, "route_step_kinds" | "route_bridge_kinds">
> {
  const routeStepKinds = unique(
    (routeResponse.steps ?? []).map((step) => {
      switch (step.type) {
        case RouteStepType.SWAP:
          return "swap";
        case RouteStepType.BRIDGE:
          return "bridge";
        case RouteStepType.IBC_TRANSFER:
          return "ibc_transfer";
        default:
          return "unknown";
      }
    })
  );

  const routeBridgeKinds = unique(
    (routeResponse.skip_operations ?? [])
      .map((operation) => {
        if (!operation || typeof operation !== "object") {
          return undefined;
        }

        if ("axelar_transfer" in operation) {
          return "axelar";
        }
        if ("cctp_transfer" in operation) {
          return "cctp";
        }
        if ("transfer" in operation || "eureka_transfer" in operation) {
          return "ibc";
        }
        if (
          "hyperlane_transfer" in operation ||
          "layer_zero_transfer" in operation ||
          "stargate_transfer" in operation ||
          "go_fast_transfer" in operation ||
          "op_init_transfer" in operation
        ) {
          return "unknown";
        }

        return undefined;
      })
      .filter((kind): kind is "axelar" | "cctp" | "ibc" | "unknown" =>
        Boolean(kind)
      )
  );

  return {
    ...(routeStepKinds.length > 0 ? { route_step_kinds: routeStepKinds } : {}),
    ...(routeBridgeKinds.length > 0
      ? { route_bridge_kinds: routeBridgeKinds }
      : {}),
  };
}

export function getEvmTxExecutionDiagnostics(
  txs: (
    | (MakeTxResponse & {
        chainId: string;
      })
    | UnsignedEVMTransactionWithErc20Approvals
  )[],
  evmSimulationOutcome?: EvmGasSimulationOutcome
): Pick<
  TxExecutionDiagnostics,
  "has_required_erc20_approval" | "has_native_value" | "evm_simulation_outcome"
> {
  const evmTxs = txs.filter(
    (tx): tx is UnsignedEVMTransactionWithErc20Approvals => !("send" in tx)
  );

  if (evmTxs.length === 0) {
    return {};
  }

  return {
    has_required_erc20_approval: evmTxs.some(
      (tx) => (tx.requiredErc20Approvals?.length ?? 0) > 0
    ),
    has_native_value: evmTxs.some((tx) => hasEvmTxNativeValue(tx.value)),
    ...(evmSimulationOutcome
      ? { evm_simulation_outcome: evmSimulationOutcome }
      : {}),
  };
}

export async function withPreSignGasEstimateDiagnostics<T>(
  simulate: () => Promise<T>,
  tx: UnsignedEVMTransactionWithErc20Approvals
): Promise<T> {
  try {
    return await simulate();
  } catch (e) {
    throw withTxExecutionDiagnostics(
      e,
      createGasEstimateDiagnostics(e, "pre_sign_simulation", tx)
    );
  }
}

export function getTxExecutionDiagnostics(
  error: unknown
): TxExecutionDiagnostics | undefined {
  if (
    typeof error === "object" &&
    error != null &&
    "diagnostics" in error &&
    typeof (error as { diagnostics?: unknown }).diagnostics === "object"
  ) {
    return sanitizeTxExecutionDiagnostics(
      (error as { diagnostics: TxExecutionDiagnostics }).diagnostics
    );
  }
}

export function withTxExecutionDiagnostics(
  error: unknown,
  diagnostics: TxExecutionDiagnostics
): Error & { diagnostics: TxExecutionDiagnostics } {
  const mergedDiagnostics = {
    ...getTxExecutionDiagnostics(error),
    ...sanitizeTxExecutionDiagnostics(diagnostics),
  };

  if (error instanceof Error) {
    return Object.assign(error, {
      diagnostics: mergedDiagnostics,
    });
  }

  const message =
    typeof error === "object" &&
    error != null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : String(error || "Unknown error");

  return Object.assign(new Error(message), {
    diagnostics: mergedDiagnostics,
  });
}

function createGasEstimateDiagnostics(
  error: unknown,
  context: GasEstimateContext,
  tx: UnsignedEVMTransactionWithErc20Approvals
): TxExecutionDiagnostics {
  return {
    gas_estimate_context: context,
    gas_estimate_error_category: classifyGasEstimateError(error),
    failed_tx_has_required_erc20_approval:
      (tx.requiredErc20Approvals?.length ?? 0) > 0,
    failed_tx_has_native_value: hasEvmTxNativeValue(tx.value),
  };
}

function sanitizeTxExecutionDiagnostics(
  diagnostics: unknown
): TxExecutionDiagnostics | undefined {
  if (!diagnostics || typeof diagnostics !== "object") {
    return undefined;
  }

  const source = diagnostics as Record<string, unknown>;
  const sanitized: TxExecutionDiagnostics = {};
  const confirmationFailureReason = source["confirmation_failure_reason"];
  const gasEstimateContext = source["gas_estimate_context"];
  const gasEstimateErrorCategory = source["gas_estimate_error_category"];
  const hasRequiredErc20Approval = source["has_required_erc20_approval"];
  const hasNativeValue = source["has_native_value"];
  const failedTxHasRequiredErc20Approval =
    source["failed_tx_has_required_erc20_approval"];
  const failedTxHasNativeValue = source["failed_tx_has_native_value"];
  const routeStepKindsValue = source["route_step_kinds"];
  const routeBridgeKindsValue = source["route_bridge_kinds"];
  const evmSimulationOutcome = source["evm_simulation_outcome"];

  if (isOneOf(confirmationFailureReason, CONFIRMATION_FAILURE_REASONS)) {
    sanitized.confirmation_failure_reason = confirmationFailureReason;
  }

  if (isOneOf(gasEstimateContext, GAS_ESTIMATE_CONTEXTS)) {
    sanitized.gas_estimate_context = gasEstimateContext;
  }

  if (isOneOf(gasEstimateErrorCategory, GAS_ESTIMATE_ERROR_CATEGORIES)) {
    sanitized.gas_estimate_error_category = gasEstimateErrorCategory;
  }

  if (typeof hasRequiredErc20Approval === "boolean") {
    sanitized.has_required_erc20_approval = hasRequiredErc20Approval;
  }

  if (typeof hasNativeValue === "boolean") {
    sanitized.has_native_value = hasNativeValue;
  }

  if (typeof failedTxHasRequiredErc20Approval === "boolean") {
    sanitized.failed_tx_has_required_erc20_approval =
      failedTxHasRequiredErc20Approval;
  }

  if (typeof failedTxHasNativeValue === "boolean") {
    sanitized.failed_tx_has_native_value = failedTxHasNativeValue;
  }

  const routeStepKinds = sanitizeStringArray(
    routeStepKindsValue,
    ROUTE_STEP_KINDS
  );
  if (routeStepKinds) {
    sanitized.route_step_kinds = routeStepKinds;
  }

  const routeBridgeKinds = sanitizeStringArray(
    routeBridgeKindsValue,
    ROUTE_BRIDGE_KINDS
  );
  if (routeBridgeKinds) {
    sanitized.route_bridge_kinds = routeBridgeKinds;
  }

  if (isOneOf(evmSimulationOutcome, EVM_SIMULATION_OUTCOMES)) {
    sanitized.evm_simulation_outcome = evmSimulationOutcome;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function classifyGasEstimateError(error: unknown): GasEstimateErrorCategory {
  const message = getErrorMessage(error).toLowerCase();

  if (message.includes("allowance")) {
    return "allowance_insufficient";
  }

  if (
    matchesAny(message, [
      "insufficient funds",
      "insufficient balance",
      "insufficient native",
      "exceeds balance",
      "not enough balance",
      "not enough gas",
    ])
  ) {
    return "native_balance_insufficient";
  }

  if (
    matchesAny(message, [
      "invalid argument",
      "invalid calldata",
      "invalid data",
      "invalid hex",
      "cannot unmarshal",
      "missing value for required argument",
    ])
  ) {
    return "invalid_calldata";
  }

  if (message.includes("execution reverted") || message.includes("revert")) {
    return "execution_reverted";
  }

  if (
    matchesAny(message, [
      "failed to fetch",
      "network error",
      "timeout",
      "timed out",
      "too many requests",
      "bad gateway",
      "service unavailable",
      "gateway timeout",
    ])
  ) {
    return "rpc_unavailable";
  }

  return "unknown";
}

function hasEvmTxNativeValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  try {
    return BigInt(value.toString()) > BigInt(0);
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error != null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return String(error || "");
}

function matchesAny(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => message.includes(pattern));
}

function isOneOf<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}

function sanitizeStringArray<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): T[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sanitized = value.filter((item): item is T =>
    isOneOf(item, allowedValues)
  );

  return sanitized.length > 0 ? [...new Set(sanitized)] : undefined;
}

function unique<T extends string>(items: T[]): T[] {
  return [...new Set(items)];
}
