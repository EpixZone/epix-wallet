import { StdFee } from "@keplr-wallet/types";

export type EpixSwapDirection = "to-osmosis" | "to-epix";

export type EpixSwapStatus =
  | "bridging"
  | "waiting-for-deposit"
  | "swapping"
  | "complete"
  | "paused"
  | "failed";

/** Public review. The matching authorization exists only in background memory. */
export interface EpixSwapReview {
  id: string;
  direction: EpixSwapDirection;
  inputDenom: string;
  sourceChainId: string;
  destinationChainId: string;
  expiresAt: number;
  executionExpiresAt: number;
  sourceAddress: string;
  destinationAddress: string;
  amountIn: string;
  outputDenom: string;
  estimatedAmountOut: string;
  minimumAmountOut: string;
  /** Preview from the current quote. Execution fetches a fresh bounded quote. */
  routes?: ReadonlyArray<{ poolId: string; tokenOutDenom: string }>;
  bridgeComplete?: boolean;
  swapComplete?: boolean;
  swapAmountOut?: string;
  bridgeFee: StdFee;
  swapFeeCap: StdFee;
  canStart: boolean;
  blockReason?: string;
  /** Osmosis fee balance after reserving any input spent from the same asset. */
  feeShortfall?: {
    denom: string;
    available: string;
    required: string;
    shortfall: string;
    address: string;
  };
  resumeOperationId?: string;
}

/** Recovery data only. This record never grants permission to sign. */
export interface EpixSwapOperation {
  id: string;
  direction: EpixSwapDirection;
  inputDenom: string;
  sourceChainId: string;
  destinationChainId: string;
  vaultId: string;
  sourceAddress: string;
  destinationAddress: string;
  amountIn: string;
  outputDenom: string;
  minimumAmountOut: string;
  estimatedAmountOut: string;
  slippageBps: number;
  feeDenom: string;
  bridgeFee: StdFee;
  swapFeeCap: StdFee;
  sourceRest: string;
  destinationRest: string;
  status: EpixSwapStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  bridgeTxHash?: string;
  swapTxHash?: string;
  packetSequence?: string;
  packetTimeoutTimestamp?: string;
  depositConfirmed: boolean;
  swapConfirmed?: boolean;
  swapAmountOut?: string;
  error?: string;
}
