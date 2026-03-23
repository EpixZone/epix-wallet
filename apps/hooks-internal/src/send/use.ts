import { ChainGetter, IQueriesStore } from "@keplr-wallet/stores";
import { useSendMixedIBCTransferConfig } from "@keplr-wallet/hooks";
import {
  useFeeConfig as useEVMFeeConfig,
  useSenderConfig as useEvmSenderConfig,
} from "@keplr-wallet/hooks-evm";
import { EthereumQueries } from "@keplr-wallet/stores-eth";

export const useSendConfig = (
  chainGetter: ChainGetter,
  queriesStore: IQueriesStore,
  chainId: string,
  sender: string,
  initialGas: number,
  disableSubFeeFromFaction: boolean,
  isIBCTransfer: boolean,
  isEvmTx?: boolean,
  options: {
    allowHexAddressToBech32Address?: boolean;
    allowHexAddressOnly?: boolean;
    icns?: {
      chainId: string;
      resolverContractAddress: string;
    };
    ens?: {
      chainId: string;
    };
    computeTerraClassicTax?: boolean;
  } = {}
) => {
  const sendConfigs = useSendMixedIBCTransferConfig(
    chainGetter,
    queriesStore,
    chainId,
    sender,
    initialGas,
    disableSubFeeFromFaction,
    isIBCTransfer,
    options
  );

  const evmSenderConfig = useEvmSenderConfig(chainGetter, chainId, sender);
  const evmFeeConfig = useEVMFeeConfig(
    chainGetter,
    queriesStore as IQueriesStore<EthereumQueries>,
    chainId,
    evmSenderConfig,
    sendConfigs.amountConfig,
    sendConfigs.gasConfig
  );

  sendConfigs.amountConfig.setFeeConfig(
    isEvmTx ? evmFeeConfig : sendConfigs.feeConfig
  );

  return {
    ...sendConfigs,
    feeConfig: (isEvmTx
      ? evmFeeConfig
      : sendConfigs.feeConfig) as typeof sendConfigs.feeConfig,
    evmFeeConfig: isEvmTx ? evmFeeConfig : undefined,
  };
};
