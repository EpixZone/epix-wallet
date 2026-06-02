import { UnsignedTransaction } from "@ethersproject/transactions";
import { EvmGasSimulationOutcome, StdFee } from "@keplr-wallet/types";
import { Any } from "@keplr-wallet/proto-types/google/protobuf/any";
import { Msg } from "@keplr-wallet/types";
import { SwapV2HistoryData } from "../recent-send-history";

export {
  SwapProvider,
  SwapV2HistoryData,
  IBCSwapMinimalTrackingData,
} from "../recent-send-history";

// Transaction status
export enum BackgroundTxStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  FAILED = "failed",
  BLOCKED = "blocked",
}

// Transaction type
export enum BackgroundTxType {
  EVM = "evm",
  COSMOS = "cosmos",
}

// Base transaction interface
interface BackgroundTxBase {
  readonly chainId: string;

  status: BackgroundTxStatus;
  feeType?: BackgroundTxFeeType;
  feeCurrencyDenom?: string;

  // Cosmos: base64 encoded, EVM: hex encoded (0x prefix)
  signedTx?: string;

  // Transaction hash for completed tx
  txHash?: string;

  // Error message if failed
  error?: string;
}

export type EVMBackgroundTxFeeType = BackgroundTxFeeType | "custom";

interface EVMBackgroundTxBase extends Omit<BackgroundTxBase, "feeType"> {
  feeType?: EVMBackgroundTxFeeType;
}

export interface EVMBackgroundTx extends EVMBackgroundTxBase {
  readonly type: BackgroundTxType.EVM;
  txData: UnsignedTransaction;
  customPriorityFee?: string;
  customGasPrice?: string;
}

export interface CosmosBackgroundTx extends BackgroundTxBase {
  readonly type: BackgroundTxType.COSMOS;
  txData: {
    aminoMsgs?: Msg[];
    protoMsgs: Any[];

    // Add rlp types data if you need to support ethermint with ledger.
    // Must include `MsgValue`.
    rlpTypes?: Record<
      string,
      Array<{
        name: string;
        type: string;
      }>
    >;

    fee?: StdFee;
    memo?: string;
  };
}

// Single transaction data with discriminated union based on type
export type BackgroundTx = EVMBackgroundTx | CosmosBackgroundTx;

export enum TxExecutionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  BLOCKED = "blocked",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum TxExecutionType {
  UNDEFINED = "undefined",
  SWAP_V2 = "swap-v2",
}

export type BackgroundTxFeeType = "low" | "average" | "high";

export type TxConfirmationFailureReason =
  | "evm_receipt_missing"
  | "evm_receipt_status_failed"
  | "evm_trace_error"
  | "cosmos_trace_missing"
  | "cosmos_trace_error"
  | "cosmos_rest_fallback_missing"
  | "cosmos_code_nonzero";

export type GasEstimateContext =
  | "review_simulation"
  | "pre_sign_simulation"
  | "background_fill_unsigned_tx";

export type GasEstimateErrorCategory =
  | "allowance_insufficient"
  | "native_balance_insufficient"
  | "execution_reverted"
  | "invalid_calldata"
  | "rpc_unavailable"
  | "unknown";

export type TxRouteStepKind = "swap" | "bridge" | "ibc_transfer" | "unknown";

export type TxRouteBridgeKind = "axelar" | "cctp" | "ibc" | "unknown";

export interface TxExecutionDiagnostics {
  confirmation_failure_reason?: TxConfirmationFailureReason;
  gas_estimate_context?: GasEstimateContext;
  gas_estimate_error_category?: GasEstimateErrorCategory;
  has_required_erc20_approval?: boolean;
  has_native_value?: boolean;
  failed_tx_has_required_erc20_approval?: boolean;
  failed_tx_has_native_value?: boolean;
  route_step_kinds?: TxRouteStepKind[];
  route_bridge_kinds?: TxRouteBridgeKind[];
  evm_simulation_outcome?: EvmGasSimulationOutcome;
}

export interface TxExecutionBase {
  readonly id: string;
  status: TxExecutionStatus;

  // keyring vault id
  readonly vaultId: string;

  // transactions
  readonly txs: BackgroundTx[];
  txIndex: number; // Current transaction being processed

  executableChainIds: string[]; // executable chain ids

  readonly timestamp: number; // Timestamp when execution started

  // If true, automatic signing is prevented and this execution may be blocked.
  // This happens when:
  // 1. Some txs are not immediately executable (chainId not in executableChainIds)
  // 2. Hardware wallet (ledger/keystone) - requires user interaction for signing
  // When preventAutoSign is true, the execution will be persisted to KVStore.
  readonly preventAutoSign: boolean;

  readonly historyTxIndex?: number;
}

export interface UndefinedTxExecution extends TxExecutionBase {
  readonly type: TxExecutionType.UNDEFINED;
  historyData?: never;
}

export interface SwapV2TxExecution extends TxExecutionBase {
  readonly type: TxExecutionType.SWAP_V2;
  historyData?: SwapV2HistoryData;

  historyId?: string;
}

export type ExecutionTypeToHistoryData = {
  [TxExecutionType.SWAP_V2]: SwapV2HistoryData;
  [TxExecutionType.UNDEFINED]: undefined;
};

export type TxExecution = UndefinedTxExecution | SwapV2TxExecution;

export type TxExecutionEvent =
  | {
      type: "executable";
      executionId: string;
      executableChainIds: string[];
    }
  | {
      type: "remove";
      executionId: string;
    };

/**
 * Result of executing a single pending transaction.
 * Used to batch state updates and reduce autorun triggers.
 */
export interface PendingTxExecutionResult {
  status: BackgroundTxStatus;
  txHash?: string;
  error?: string;
  diagnostics?: TxExecutionDiagnostics;
}

/**
 * Result of executing a single transaction.
 * Used to batch state updates and reduce autorun triggers.
 */
export interface TxExecutionResult {
  status: TxExecutionStatus;
  error?: string;
  diagnostics?: TxExecutionDiagnostics;
}
