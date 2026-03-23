import { IGasSimulator } from "@keplr-wallet/hooks";
import { GasSimulatorStatus } from "../../../../../hooks/fee/types";

export const useGasSimulatorStatus = (
  gasSimulator: IGasSimulator | undefined
): GasSimulatorStatus => {
  const isGasSimulatorUsable = (() => {
    if (!gasSimulator) {
      return false;
    }

    if (gasSimulator.gasEstimated == null && gasSimulator.uiProperties.error) {
      return false;
    }

    return true;
  })();
  const isGasSimulatorEnabled = (() => {
    if (!isGasSimulatorUsable) {
      return false;
    }
    return !!gasSimulator?.enabled;
  })();

  return { isGasSimulatorUsable, isGasSimulatorEnabled };
};
