import {
  AppCurrency,
  EvmGasSimulationOutcome,
  FeeCurrency,
  StdFee,
} from "@keplr-wallet/types";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { NameService } from "./name-service";
import { IModularChainInfoImpl } from "@keplr-wallet/stores";

export interface ITxChainSetter {
  chainId: string;
  setChain(chainId: string): void;
  modularChainInfo: IModularChainInfoImpl;
}

export interface UIProperties {
  // There is an error that cannot proceed the tx.
  readonly error?: Error;
  // Able to handle tx but prefer to show warning
  readonly warning?: Error;
  // Prefer that the loading UI is displayed.
  // In the case of "loading-block", the UI should handle it so that the user cannot proceed until loading is completed.
  readonly loadingState?: "loading" | "loading-block";
}

export type FeeType = "high" | "average" | "low";
export type EVMFeeType = FeeType | "custom";

export interface IGasConfig extends ITxChainSetter {
  value: string;
  setValue(value: string | number): void;

  gas: number;

  uiProperties: UIProperties;
}

export interface ISenderConfig extends ITxChainSetter {
  value: string;
  setValue(value: string): void;

  sender: string;

  uiProperties: UIProperties;
}

export interface IFeeConfig extends ITxChainSetter {
  type: EVMFeeType;
  setType(type: EVMFeeType): void;

  maxFeePerGas: Dec | undefined;
  maxPriorityFeePerGas: Dec | undefined;
  gasPrice: Dec | undefined;

  fee: CoinPretty | undefined;
  maxFee: CoinPretty | undefined;

  l1DataFee: Dec | undefined;
  setL1DataFee(fee: Dec): void;

  refreshEIP1559TxFees(): void;

  customPriorityFee: string;
  customPriorityFeeInput: string;
  setCustomPriorityFee(fee: string): void;

  isLegacyFeeMode: boolean;
  customGasPrice: string;
  customGasPriceInput: string;
  setCustomGasPrice(value: string): void;

  getEIP1559TxFees(feeType: EVMFeeType | "manual"): {
    maxPriorityFeePerGas?: Dec;
    maxFeePerGas?: Dec;
    gasPrice?: Dec;
  };

  // hooks IFeeConfig 구조 호환용
  fees: CoinPretty[];
  selectableFeeCurrencies: FeeCurrency[];
  setFee(
    fee:
      | { type: EVMFeeType; currency: FeeCurrency }
      | CoinPretty
      | CoinPretty[]
      | undefined
  ): void;
  getFeeTypePrettyForFeeCurrency(
    currency: FeeCurrency,
    feeType: EVMFeeType
  ): CoinPretty;
  toStdFee(): StdFee;

  uiProperties: UIProperties;
}

export interface IRecipientConfig extends ITxChainSetter {
  value: string;
  setValue(value: string): void;

  recipient: string;

  uiProperties: UIProperties;
}

export interface IRecipientConfigWithNameServices extends IRecipientConfig {
  preferredNameService: string | undefined;
  setPreferredNameService(nameService: string | undefined): void;
  getNameService(type: string): NameService | undefined;
  getNameServices(): NameService[];
  nameServiceResult: {
    type: string;
    address: string;
    fullName: string;
    domain: string;
    suffix: string;
  }[];
}

export interface IAmountConfig extends ITxChainSetter {
  amount: CoinPretty[];

  value: string;
  setValue(value: string): void;

  currency: AppCurrency;
  setCurrency(currency: AppCurrency | undefined): void;
  canUseCurrency(currency: AppCurrency): boolean;

  // Zero means unset.
  fraction: number;
  setFraction(fraction: number): void;

  uiProperties: UIProperties;
}

export interface IGasSimulator {
  enabled: boolean;
  setEnabled(value: boolean): void;

  isSimulating: boolean;

  gasEstimated: number | undefined;
  gasAdjustment: number;

  gasAdjustmentValue: string;
  setGasAdjustmentValue(gasAdjustment: string | number): void;

  evmSimulationOutcome?: EvmGasSimulationOutcome;

  uiProperties: UIProperties;
}
