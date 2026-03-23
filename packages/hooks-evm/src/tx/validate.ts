import {
  IAmountConfig,
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
  IRecipientConfig,
  ISenderConfig,
} from "./types";

// CONTRACT: Use with `observer`
export const useTxConfigsValidate = (configs: {
  amountConfig?: IAmountConfig;
  senderConfig?: ISenderConfig;
  recipientConfig?: IRecipientConfig;
  gasConfig?: IGasConfig;
  feeConfig?: IFeeConfig;
  gasSimulator?: IGasSimulator;
}) => {
  const interactionBlocked = (() => {
    const amountConfigUIProperties = configs.amountConfig?.uiProperties;
    const senderConfigUIProperties = configs.senderConfig?.uiProperties;
    const recipientConfigUIProperties = configs.recipientConfig?.uiProperties;
    const gasConfigUIProperties = configs.gasConfig?.uiProperties;
    const feeConfigUIProperties = configs.feeConfig?.uiProperties;
    const gasSimulatorUIProperties = configs.gasSimulator?.uiProperties;

    if (
      amountConfigUIProperties?.error ||
      senderConfigUIProperties?.error ||
      recipientConfigUIProperties?.error ||
      gasConfigUIProperties?.error ||
      feeConfigUIProperties?.error ||
      gasSimulatorUIProperties?.error
    ) {
      return true;
    }

    if (
      amountConfigUIProperties?.loadingState === "loading-block" ||
      senderConfigUIProperties?.loadingState === "loading-block" ||
      recipientConfigUIProperties?.loadingState === "loading-block" ||
      gasConfigUIProperties?.loadingState === "loading-block" ||
      feeConfigUIProperties?.loadingState === "loading-block" ||
      gasSimulatorUIProperties?.loadingState === "loading-block"
    ) {
      return true;
    }

    return false;
  })();

  return {
    interactionBlocked,
  };
};
