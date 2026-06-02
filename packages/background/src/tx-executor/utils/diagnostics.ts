import { UnsignedTransaction } from "@ethersproject/transactions";
import { EvmGasSimulationOutcome } from "@keplr-wallet/types";
import {
  GasEstimateContext,
  GasEstimateErrorCategory,
  TxConfirmationFailureReason,
  TxExecutionDiagnostics,
  TxRouteBridgeKind,
  TxRouteStepKind,
} from "../types";

const CONFIRMATION_FAILURE_REASONS: readonly TxConfirmationFailureReason[] = [
  "evm_receipt_missing",
  "evm_receipt_status_failed",
  "evm_trace_error",
  "cosmos_trace_missing",
  "cosmos_trace_error",
  "cosmos_rest_fallback_missing",
  "cosmos_code_nonzero",
];

const GAS_ESTIMATE_CONTEXTS: readonly GasEstimateContext[] = [
  "review_simulation",
  "pre_sign_simulation",
  "background_fill_unsigned_tx",
];

const GAS_ESTIMATE_ERROR_CATEGORIES: readonly GasEstimateErrorCategory[] = [
  "allowance_insufficient",
  "native_balance_insufficient",
  "execution_reverted",
  "invalid_calldata",
  "rpc_unavailable",
  "unknown",
];

const ROUTE_STEP_KINDS: readonly TxRouteStepKind[] = [
  "swap",
  "bridge",
  "ibc_transfer",
  "unknown",
];

const ROUTE_BRIDGE_KINDS: readonly TxRouteBridgeKind[] = [
  "axelar",
  "cctp",
  "ibc",
  "unknown",
];

const EVM_SIMULATION_OUTCOMES: readonly EvmGasSimulationOutcome[] = [
  EvmGasSimulationOutcome.TX_SIMULATED,
  EvmGasSimulationOutcome.TX_BUNDLE_SIMULATED,
  EvmGasSimulationOutcome.APPROVAL_ONLY_SIMULATED,
];

export class TxExecutionDiagnosticsError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: TxExecutionDiagnostics
  ) {
    super(message);
    this.name = "TxExecutionDiagnosticsError";
  }
}

export function getTxExecutionDiagnostics(
  error: unknown
): TxExecutionDiagnostics | undefined {
  if (
    error instanceof TxExecutionDiagnosticsError ||
    (typeof error === "object" &&
      error != null &&
      "diagnostics" in error &&
      typeof (error as { diagnostics?: unknown }).diagnostics === "object")
  ) {
    return sanitizeTxExecutionDiagnostics(
      (error as { diagnostics: TxExecutionDiagnostics }).diagnostics
    );
  }
}

export function withTxExecutionDiagnostics(
  error: unknown,
  diagnostics: TxExecutionDiagnostics
): TxExecutionDiagnosticsError {
  const message =
    typeof error === "object" &&
    error != null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : String(error || "Unknown error");

  return new TxExecutionDiagnosticsError(message, {
    ...getTxExecutionDiagnostics(error),
    ...sanitizeTxExecutionDiagnostics(diagnostics),
  });
}

export function createGasEstimateDiagnostics(
  error: unknown,
  context: GasEstimateContext,
  tx?: Pick<UnsignedTransaction, "value"> & {
    requiredErc20Approvals?: unknown[];
  }
): TxExecutionDiagnostics {
  return {
    gas_estimate_context: context,
    gas_estimate_error_category: classifyGasEstimateError(error),
    ...(tx
      ? {
          failed_tx_has_required_erc20_approval:
            (tx.requiredErc20Approvals?.length ?? 0) > 0,
          failed_tx_has_native_value: hasEvmTxNativeValue(tx.value),
        }
      : {}),
  };
}

export function classifyGasEstimateError(
  error: unknown
): GasEstimateErrorCategory {
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

export function hasEvmTxNativeValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  try {
    return BigInt(value.toString()) > BigInt(0);
  } catch {
    return false;
  }
}

export function sanitizeTxExecutionDiagnostics(
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

  const routeStepKinds = sanitizeStringArray(routeStepKindsValue, [
    ...ROUTE_STEP_KINDS,
  ]);
  if (routeStepKinds) {
    sanitized.route_step_kinds = routeStepKinds;
  }

  const routeBridgeKinds = sanitizeStringArray(routeBridgeKindsValue, [
    ...ROUTE_BRIDGE_KINDS,
  ]);
  if (routeBridgeKinds) {
    sanitized.route_bridge_kinds = routeBridgeKinds;
  }

  if (isOneOf(evmSimulationOutcome, EVM_SIMULATION_OUTCOMES)) {
    sanitized.evm_simulation_outcome = evmSimulationOutcome;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
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
