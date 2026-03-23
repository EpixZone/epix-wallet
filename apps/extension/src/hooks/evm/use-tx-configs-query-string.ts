import {
  FeeType,
  IAmountConfig,
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
  IRecipientConfig,
} from "@keplr-wallet/hooks-evm";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export const useEvmTxConfigsQueryString = (configs: {
  amountConfig: IAmountConfig;
  recipientConfig?: IRecipientConfig;
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  gasSimulator: IGasSimulator;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const initialAmountFraction = searchParams.get("initialAmountFraction");
    if (
      initialAmountFraction &&
      !Number.isNaN(parseFloat(initialAmountFraction))
    ) {
      configs.amountConfig.setFraction(
        Number.parseFloat(initialAmountFraction)
      );
    }
    const initialAmount = searchParams.get("initialAmount");
    if (initialAmount) {
      configs.amountConfig.setValue(initialAmount);
    }
    const initialRecipient = searchParams.get("initialRecipient");
    if (initialRecipient) {
      configs.recipientConfig?.setValue(initialRecipient);
    }

    const initialFeeType = searchParams.get("initialFeeType") as FeeType;
    if (initialFeeType) {
      configs.feeConfig.setType(initialFeeType);
    }

    const initialGasAmount = searchParams.get("initialGasAmount");
    if (initialGasAmount) {
      configs.gasConfig.setValue(initialGasAmount);
      configs.gasSimulator.setEnabled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        if (
          configs.recipientConfig &&
          configs.recipientConfig.value.trim().length > 0
        ) {
          prev.set("initialRecipient", configs.recipientConfig.value);
        } else {
          prev.delete("initialRecipient");
        }
        if (configs.amountConfig.fraction <= 0) {
          prev.delete("initialAmountFraction");
          if (configs.amountConfig.value.trim().length > 0) {
            prev.set("initialAmount", configs.amountConfig.value);
          } else {
            prev.delete("initialAmount");
          }
        } else {
          prev.delete("initialAmount");
          prev.set(
            "initialAmountFraction",
            configs.amountConfig.fraction.toString()
          );
        }
        prev.set("initialFeeType", configs.feeConfig.type);

        if (configs.gasSimulator.enabled) {
          prev.delete("initialGasAmount");
        } else {
          prev.set("initialGasAmount", configs.gasConfig.value.toString());
        }
        return prev;
      },
      {
        replace: true,
      }
    );
  }, [
    configs.amountConfig.fraction,
    configs.amountConfig.value,
    configs.feeConfig.type,
    configs.gasConfig.value,
    configs.gasSimulator.enabled,
    configs.recipientConfig,
    setSearchParams,
  ]);
};
