import { ChainGetter } from "@keplr-wallet/stores";
import {
  useFeeConfig,
  useGasConfig,
  useRecipientConfig,
  useSenderConfig,
} from "./index";
import { useAmountConfig } from "./amount";
import { QueriesStore } from "./internal";

export const useSendTxConfig = (
  chainGetter: ChainGetter,
  queriesStore: QueriesStore,
  chainId: string,
  sender: string,
  initialGas: number,
  options?: {
    ens?: {
      chainId: string;
    };
  }
) => {
  const senderConfig = useSenderConfig(chainGetter, chainId, sender);

  const amountConfig = useAmountConfig(
    chainGetter,
    queriesStore,
    chainId,
    senderConfig
  );

  const gasConfig = useGasConfig(chainGetter, chainId, initialGas);
  const feeConfig = useFeeConfig(
    chainGetter,
    queriesStore,
    chainId,
    senderConfig,
    amountConfig,
    gasConfig
  );

  amountConfig.setFeeConfig(feeConfig);

  const recipientConfig = useRecipientConfig(chainGetter, chainId, {
    ens: options?.ens,
  });

  return {
    senderConfig,
    amountConfig,
    gasConfig,
    feeConfig,
    recipientConfig,
  };
};
