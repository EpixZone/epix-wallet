import React, { FunctionComponent } from "react";
import {
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
  ISenderConfig,
} from "@keplr-wallet/hooks";
import { CosmosFeeControl } from "./cosmos";
import { EVMFeeControl } from "./evm";

// Re-export from hooks/fee for backward compatibility
export {
  useFeeOptionSelectionOnInit,
  useAutoFeeCurrencySelectionOnInit,
} from "../../../hooks/fee";

export const FeeControl: FunctionComponent<{
  senderConfig: ISenderConfig;
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  gasSimulator?: IGasSimulator;

  disableAutomaticFeeSet?: boolean;
  isForEVMTx?: boolean;
  nonceMethod?: "pending" | "latest";
  setNonceMethod?: (nonceMethod: "pending" | "latest") => void;
  isExternalMsg?: boolean;
  shouldTopUp?: boolean;
  forceTopUp?: boolean;
}> = (props) => {
  if (props.isForEVMTx) {
    return <EVMFeeControl {...props} />;
  }
  return <CosmosFeeControl {...props} />;
};
