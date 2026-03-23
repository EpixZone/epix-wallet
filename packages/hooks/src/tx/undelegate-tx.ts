import { ChainGetter } from "@keplr-wallet/stores";
import {
  useFeeConfig,
  useGasConfig,
  useMemoConfig,
  useRecipientConfig,
  useSenderConfig,
} from "./index";
import { useStakedAmountConfig } from "./staked-amount";
import { QueriesStore } from "./internal";

export const useUndelegateTxConfig = (
  chainGetter: ChainGetter,
  queriesStore: QueriesStore,
  chainId: string,
  sender: string,
  validatorAddress: string,
  initialGas: number
) => {
  const senderConfig = useSenderConfig(chainGetter, chainId, sender);
  const amountConfig = useStakedAmountConfig(
    chainGetter,
    queriesStore,
    chainId,
    validatorAddress,
    senderConfig
  );

  const memoConfig = useMemoConfig(chainGetter, chainId);
  const gasConfig = useGasConfig(chainGetter, chainId, initialGas);
  const feeConfig = useFeeConfig(
    chainGetter,
    queriesStore,
    chainId,
    senderConfig,
    amountConfig,
    gasConfig,
    {
      additionAmountToNeedFee: false,
    }
  );
  amountConfig.setFeeConfig(feeConfig);

  const recipientConfig = useRecipientConfig(chainGetter, chainId);
  const mcInfo = chainGetter.getModularChain(chainId);
  const u = mcInfo.unwrapped;
  if (
    (u.type === "cosmos" || u.type === "ethermint") &&
    u.cosmos.bech32Config
  ) {
    recipientConfig.setBech32Prefix(u.cosmos.bech32Config.bech32PrefixValAddr);
  }
  recipientConfig.setValue(validatorAddress);
  amountConfig.setCurrency(
    u.type === "cosmos" || u.type === "ethermint"
      ? u.cosmos.stakeCurrency
      : undefined
  );

  return {
    amountConfig,
    memoConfig,
    gasConfig,
    feeConfig,
    recipientConfig,
    senderConfig,
  };
};
