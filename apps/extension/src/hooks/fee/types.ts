import {
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
  ISenderConfig,
} from "@keplr-wallet/hooks";
import { IFeeConfig as EVMFeeConfig } from "@keplr-wallet/hooks-evm";
import { CoinPretty, Dec, PricePretty } from "@keplr-wallet/unit";
import { IFeeConfig as IEVMFeeConfig } from "@keplr-wallet/hooks-evm";

export interface FeeControlBaseProps {
  senderConfig: ISenderConfig;
  gasConfig: IGasConfig;
  gasSimulator?: IGasSimulator;
  disableAutomaticFeeSet?: boolean;
  isExternalMsg?: boolean;
  shouldTopUp?: boolean;
  forceTopUp?: boolean;
}

export interface EVMFeeControlProps extends FeeControlBaseProps {
  isForEVMTx: true;
  feeConfig: IEVMFeeConfig;
  nonceMethod?: "pending" | "latest";
  setNonceMethod?: (nonceMethod: "pending" | "latest") => void;
}

export interface CosmosFeeControlProps extends FeeControlBaseProps {
  isForEVMTx?: false;
  feeConfig: IFeeConfig;
}

export type FeeControlProps = EVMFeeControlProps | CosmosFeeControlProps;

export interface TransactionFeeModalBaseProps {
  close: () => void;
  senderConfig: ISenderConfig;
  gasConfig: IGasConfig;
  swapAmountConfig?: {
    swapFeeBps: number;
  };
  gasSimulator?: IGasSimulator;
  disableAutomaticFeeSet?: boolean;
  isExternalMsg?: boolean;
}

export interface EVMTransactionFeeModalProps
  extends TransactionFeeModalBaseProps {
  isForEVMTx: true;
  feeConfig: IEVMFeeConfig;
  nonceMethod?: "pending" | "latest";
  setNonceMethod?: (nonceMethod: "pending" | "latest") => void;
}

export interface CosmosTransactionFeeModalProps
  extends TransactionFeeModalBaseProps {
  isForEVMTx?: false;
  feeConfig: IFeeConfig;
}

export type TransactionFeeModalProps =
  | EVMTransactionFeeModalProps
  | CosmosTransactionFeeModalProps;

export interface FeeCalculationParams {
  fee: CoinPretty;
  l1DataFee: Dec | undefined;
  isShowingFeeWithGasEstimated: boolean;
  gasConfigGas: number;
  gasSimulatorAdjustment: number | undefined;
  gasSimulatorEstimated: number | undefined;
  isFeeSetByUser?: boolean;
}

export interface FeePriceResult {
  total: PricePretty | undefined;
  hasUnknown: boolean;
}

export interface GasSimulatorStatus {
  isGasSimulatorUsable: boolean;
  isGasSimulatorEnabled: boolean;
}

export function isEVMFeeConfig(
  feeConfig: IFeeConfig
): feeConfig is EVMFeeConfig {
  return (
    "customPriorityFee" in feeConfig && "setCustomPriorityFee" in feeConfig
  );
}
