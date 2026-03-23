import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import {
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
  ISenderConfig,
} from "@keplr-wallet/hooks";
import { IFeeConfig as IEVMFeeConfig } from "@keplr-wallet/hooks-evm";
import { SwapAmountConfig } from "@keplr-wallet/hooks-internal";
import {
  EVMTransactionFeeModalProps,
  CosmosTransactionFeeModalProps,
  isEVMFeeConfig,
} from "../../../../hooks/fee/types";
import { CosmosTransactionFeeModal } from "./cosmos-transaction-fee-modal";
import { EVMTransactionFeeModal } from "./evm-transaction-fee-modal";

export const TransactionFeeModal: FunctionComponent<{
  close: () => void;

  senderConfig: ISenderConfig;
  feeConfig: IFeeConfig | IEVMFeeConfig;
  gasConfig: IGasConfig;
  swapAmountConfig?: SwapAmountConfig;
  gasSimulator?: IGasSimulator;
  disableAutomaticFeeSet?: boolean;
  isExternalMsg?: boolean;
  isForEVMTx?: boolean;
  nonceMethod?: "pending" | "latest";
  setNonceMethod?: (nonceMethod: "pending" | "latest") => void;
}> = observer((props) => {
  if (props.isForEVMTx && isEVMFeeConfig(props.feeConfig)) {
    return (
      <EVMTransactionFeeModal {...(props as EVMTransactionFeeModalProps)} />
    );
  }
  return (
    <CosmosTransactionFeeModal {...(props as CosmosTransactionFeeModalProps)} />
  );
});
