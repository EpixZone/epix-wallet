import { useEffect } from "react";
import { IFeeConfig } from "@keplr-wallet/hooks";
import { IFeeConfig as IEVMFeeConfig } from "@keplr-wallet/hooks-evm";
import { UIConfigStore } from "../../../../../stores/ui-config";

export const useRememberLastFeeOption = (
  uiConfigStore: UIConfigStore,
  feeConfig: IFeeConfig | IEVMFeeConfig
): void => {
  useEffect(() => {
    if (uiConfigStore.rememberLastFeeOption) {
      if (feeConfig.type !== "manual" && feeConfig.type !== "custom") {
        uiConfigStore.setLastFeeOption(feeConfig.type);
      }
    } else {
      uiConfigStore.setLastFeeOption(false);
    }
  }, [feeConfig.type, uiConfigStore, uiConfigStore.rememberLastFeeOption]);
};
