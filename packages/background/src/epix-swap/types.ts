import { StdFee } from "@keplr-wallet/types";

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
  expiresAt: number;
  executionExpiresAt: number;
  sourceAddress: string;
  destinationAddress: string;
  amountIn: string;
  outputDenom: string;
  estimatedAmountOut: string;
  minimumAmountOut: string;
  bridgeFee: StdFee;
  swapFeeCap: StdFee;
  canStart: boolean;
  blockReason?: string;
  resumeOperationId?: string;
}

/** Recovery data only. This record never grants permission to sign. */
export interface EpixSwapOperation {
  id: string;
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
  error?: string;
}
