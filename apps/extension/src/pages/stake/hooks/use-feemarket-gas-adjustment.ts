import { useEffect } from "react";
import { IFeeConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { useStore } from "../../../stores";

// Chains with the feemarket feature under-report gas on simulation, so the
// gas adjustment must be raised. Same workaround as the send page.
export const useFeemarketGasAdjustment = (
  chainId: string,
  gasSimulator: IGasSimulator,
  feeConfig: IFeeConfig
) => {
  const { chainStore } = useStore();

  const currentFeeCurrencyCoinMinimalDenom =
    feeConfig.fees[0]?.currency.coinMinimalDenom;
  useEffect(() => {
    const u = chainStore.getModularChain(chainId).unwrapped;
    const hasFeemarketFeature =
      (u.type === "cosmos" || u.type === "ethermint") &&
      u.cosmos.features?.includes("feemarket");
    if (hasFeemarketFeature) {
      if (
        currentFeeCurrencyCoinMinimalDenom !==
        (u.type === "cosmos" || u.type === "ethermint"
          ? u.cosmos.currencies[0].coinMinimalDenom
          : "")
      ) {
        gasSimulator.setGasAdjustmentValue("2");
      } else {
        gasSimulator.setGasAdjustmentValue("1.6");
      }
    }
  }, [chainId, chainStore, gasSimulator, currentFeeCurrencyCoinMinimalDenom]);
};
