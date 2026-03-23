import { useEffect, useRef, useState } from "react";
import { IFeeConfig, IGasConfig } from "@keplr-wallet/hooks";
import { IFeeConfig as IEVMFeeConfig } from "@keplr-wallet/hooks-evm";

export const useChangesApplied = (
  feeConfig: IFeeConfig | IEVMFeeConfig,
  gasConfig: IGasConfig,
  isGasSimulatorEnabled: boolean
): boolean => {
  const [showChangesApplied, setShowChangesApplied] = useState(false);
  const feeConfigCurrencyString = feeConfig
    .toStdFee()
    .amount.map((x) => x.denom)
    .join(",");
  const prevFeeConfigType = useRef(feeConfig.type);
  const prevFeeConfigCurrency = useRef(feeConfigCurrencyString);
  const prevGasConfigGas = useRef(gasConfig.gas);
  const prevGasSimulatorEnabled = useRef(isGasSimulatorEnabled);
  const lastShowChangesAppliedTimeout = useRef<NodeJS.Timeout | undefined>(
    undefined
  );

  useEffect(() => {
    if (
      prevFeeConfigType.current !== feeConfig.type ||
      prevFeeConfigCurrency.current !== feeConfigCurrencyString ||
      prevGasConfigGas.current !== gasConfig.gas ||
      prevGasSimulatorEnabled.current !== isGasSimulatorEnabled
    ) {
      if (lastShowChangesAppliedTimeout.current) {
        clearTimeout(lastShowChangesAppliedTimeout.current);
        lastShowChangesAppliedTimeout.current = undefined;
      }
      setShowChangesApplied(true);
      lastShowChangesAppliedTimeout.current = setTimeout(() => {
        setShowChangesApplied(false);
        lastShowChangesAppliedTimeout.current = undefined;
      }, 2500);
    }

    prevFeeConfigType.current = feeConfig.type;
    prevFeeConfigCurrency.current = feeConfigCurrencyString;
    prevGasConfigGas.current = gasConfig.gas;
    prevGasSimulatorEnabled.current = isGasSimulatorEnabled;
  }, [
    feeConfig.type,
    feeConfigCurrencyString,
    gasConfig.gas,
    isGasSimulatorEnabled,
  ]);

  return showChangesApplied;
};
