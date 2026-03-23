import { useLayoutEffect } from "react";
import { IFeeConfig, ISenderConfig } from "@keplr-wallet/hooks";
import { IChainStore, IQueriesStore } from "@keplr-wallet/stores";
import { autorun } from "mobx";
import { Dec } from "@keplr-wallet/unit";
import { EthereumAccountBase } from "@keplr-wallet/stores-eth";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (..._args: any[]) => {
  // noop
};

export const useAutoFeeCurrencySelectionOnInit = (
  chainStore: IChainStore,
  queriesStore: IQueriesStore,
  senderConfig: ISenderConfig,
  feeConfig: IFeeConfig,
  disableAutomaticFeeSet: boolean | undefined
) => {
  useLayoutEffect(() => {
    if (disableAutomaticFeeSet) {
      return;
    }

    // Require to invoke effect whenever chain is changed,
    // even though it is not used in logic.
    noop(feeConfig.chainId);

    // Try to find other fee currency if the account doesn't have enough fee to pay.
    // This logic can be slightly complex, so use mobx's `autorun`.
    // This part fairly different with the approach of react's hook.
    let skip = false;
    // Try until 500ms to avoid the confusion to user.
    const timeoutId = setTimeout(() => {
      skip = true;
    }, 2000);

    const disposer = autorun(() => {
      if (
        !skip &&
        feeConfig.type !== "manual" &&
        feeConfig.type !== "custom" &&
        feeConfig.selectableFeeCurrencies.length > 1 &&
        feeConfig.fees.length > 0
      ) {
        const modularChainInfoForFee = chainStore.getModularChain(
          feeConfig.chainId
        );
        const isEvmCapable =
          modularChainInfoForFee.type === "evm" ||
          modularChainInfoForFee.type === "ethermint";
        const queryBalances =
          isEvmCapable &&
          EthereumAccountBase.isEthereumHexAddressWithChecksum(
            senderConfig.sender
          )
            ? queriesStore
                .get(feeConfig.chainId)
                .queryBalances.getQueryEthereumHexAddress(senderConfig.sender)
            : queriesStore
                .get(feeConfig.chainId)
                .queryBalances.getQueryBech32Address(senderConfig.sender);

        const currentFeeCurrency = feeConfig.fees[0].currency;
        const currentFeeCurrencyBal =
          queryBalances.getBalanceFromCurrency(currentFeeCurrency);

        const currentFee = feeConfig.getFeeTypePrettyForFeeCurrency(
          currentFeeCurrency,
          feeConfig.type
        );
        if (currentFeeCurrencyBal.toDec().lt(currentFee.toDec())) {
          const isOsmosis = (() => {
            if (!chainStore.hasModularChain(feeConfig.chainId)) return false;
            const mc = chainStore.getModularChain(feeConfig.chainId);
            const uw = mc.unwrapped;
            if (uw.type === "cosmos" || uw.type === "ethermint") {
              return uw.cosmos.features?.includes("osmosis-txfees") ?? false;
            }
            return false;
          })();

          // Not enough balances for fee.
          // Try to find other fee currency to send.
          for (const feeCurrency of feeConfig.selectableFeeCurrencies) {
            const feeCurrencyBal =
              queryBalances.getBalanceFromCurrency(feeCurrency);
            const fee = feeConfig.getFeeTypePrettyForFeeCurrency(
              feeCurrency,
              feeConfig.type
            );

            if (isOsmosis && fee.toDec().lte(new Dec(0))) {
              continue;
            }

            if (feeCurrencyBal.toDec().gte(fee.toDec())) {
              feeConfig.setFee({
                type: feeConfig.type,
                currency: feeCurrency,
              });
              const uiProperties = feeConfig.uiProperties;
              skip =
                !uiProperties.loadingState &&
                uiProperties.error == null &&
                uiProperties.warning == null;
              return;
            }
          }
        }
      }
    });

    return () => {
      clearTimeout(timeoutId);
      skip = true;
      disposer();
    };
  }, [
    chainStore,
    disableAutomaticFeeSet,
    feeConfig,
    feeConfig.chainId,
    queriesStore,
    senderConfig.sender,
  ]);
};
