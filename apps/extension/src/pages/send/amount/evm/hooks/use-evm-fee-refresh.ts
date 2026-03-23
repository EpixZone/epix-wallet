import { useEffect } from "react";

const REFRESH_EIP1559_TX_FEE_INTERVAL_TIME_MS = 12000;

export function useRefreshEIP1559TxFee(
  isEvmTx: boolean,
  feeConfig: { refreshEIP1559TxFees: () => void } | undefined
) {
  useEffect(() => {
    if (isEvmTx && feeConfig) {
      // Refresh EIP-1559 fee every 12 seconds.
      const intervalId = setInterval(() => {
        feeConfig.refreshEIP1559TxFees();
      }, REFRESH_EIP1559_TX_FEE_INTERVAL_TIME_MS);

      return () => clearInterval(intervalId);
    }
  }, [isEvmTx, feeConfig]);
}
