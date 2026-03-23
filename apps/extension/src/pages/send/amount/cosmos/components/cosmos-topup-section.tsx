import React, { FunctionComponent, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { FeeConfig, SenderConfig } from "@keplr-wallet/hooks";
import { useTopUp } from "../../../../../hooks/use-topup";
import { TopUpState } from "../../types";

export const CosmosTopUpWrapper: FunctionComponent<{
  feeConfig: FeeConfig;
  senderConfig: SenderConfig;
  hasHardwareWalletError?: boolean;
  onTopUpStateChange: (state: TopUpState) => void;
  children: React.ReactNode;
}> = observer(
  ({
    feeConfig,
    senderConfig,
    hasHardwareWalletError,
    onTopUpStateChange,
    children,
  }) => {
    const { shouldTopUp, remainingText, isTopUpAvailable } = useTopUp({
      feeConfig,
      senderConfig,
      hasHardwareWalletError,
    });

    useEffect(() => {
      onTopUpStateChange({ shouldTopUp, remainingText, isTopUpAvailable });
    }, [shouldTopUp, remainingText, isTopUpAvailable, onTopUpStateChange]);

    return <React.Fragment>{children}</React.Fragment>;
  }
);
