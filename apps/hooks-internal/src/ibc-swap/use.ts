import {
  ChainGetter,
  CosmosAccount,
  CosmwasmAccount,
  IAccountStoreWithInjects,
  IQueriesStore,
} from "@keplr-wallet/stores";
import {
  useFeeConfig,
  useGasConfig,
  useMemoConfig,
  useSenderConfig,
} from "@keplr-wallet/hooks";
import {
  useFeeConfig as useEVMFeeConfig,
  useSenderConfig as useEvmSenderConfig,
} from "@keplr-wallet/hooks-evm";
import { useIBCSwapAmountConfig } from "./amount";
import { SkipQueries } from "@keplr-wallet/stores-internal";
import { AppCurrency } from "@keplr-wallet/types";
import {
  EthereumAccountStore,
  EthereumQueries,
} from "@keplr-wallet/stores-eth";

export const useIBCSwapConfig = (
  chainGetter: ChainGetter,
  queriesStore: IQueriesStore,
  accountStore: IAccountStoreWithInjects<[CosmosAccount, CosmwasmAccount]>,
  ethereumAccountStore: EthereumAccountStore,
  skipQueries: SkipQueries,
  chainId: string,
  sender: string,
  initialGas: number,
  outChainId: string,
  outCurrency: AppCurrency,
  disableSubFeeFromFaction: boolean,
  swapFeeBps: number,
  isEvmTx?: boolean,
  allowSwaps?: boolean,
  smartSwapOptions?: {
    evmSwaps?: boolean;
    splitRoutes?: boolean;
  }
) => {
  const senderConfig = useSenderConfig(chainGetter, chainId, sender);
  const evmSenderConfig = useEvmSenderConfig(chainGetter, chainId, sender);
  const amountConfig = useIBCSwapAmountConfig(
    chainGetter,
    queriesStore,
    accountStore,
    ethereumAccountStore,
    skipQueries,
    chainId,
    senderConfig,
    outChainId,
    outCurrency,
    disableSubFeeFromFaction,
    swapFeeBps,
    allowSwaps,
    smartSwapOptions
  );

  const memoConfig = useMemoConfig(chainGetter, chainId);
  const gasConfig = useGasConfig(chainGetter, chainId, initialGas);
  const feeConfig = useFeeConfig(
    chainGetter,
    queriesStore,
    chainId,
    senderConfig,
    amountConfig,
    gasConfig
  );

  const evmFeeConfig = useEVMFeeConfig(
    chainGetter,
    queriesStore as IQueriesStore<EthereumQueries>,
    chainId,
    evmSenderConfig,
    amountConfig,
    gasConfig
  );

  amountConfig.setFeeConfig(isEvmTx ? evmFeeConfig : feeConfig);

  return {
    amountConfig,
    memoConfig,
    gasConfig,
    feeConfig: (isEvmTx ? evmFeeConfig : feeConfig) as typeof feeConfig,
    evmFeeConfig: isEvmTx ? evmFeeConfig : undefined,
    senderConfig,
  };
};
