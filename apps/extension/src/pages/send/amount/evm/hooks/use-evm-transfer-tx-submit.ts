import { useCallback } from "react";
import { CoinPretty, Dec, DecUtils } from "@keplr-wallet/unit";
import { EthTxStatus } from "@keplr-wallet/types";
import { SendTxEthereumMsgAndRecordMsg } from "@keplr-wallet/background";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { EthereumAccountBase } from "@keplr-wallet/stores-eth";
import { useNotification } from "../../../../../hooks/notification";
import { useIntl } from "react-intl";

// Structural interface — works with both hooks FeeConfig and hooks-evm FeeConfig
interface EvmFeeConfigLike {
  type: string;
  fees: CoinPretty[];
  getEIP1559TxFees(feeType: string): {
    maxFeePerGas?: Dec;
    maxPriorityFeePerGas?: Dec;
    gasPrice?: Dec;
  };
}

interface BalanceLike {
  currency: { coinMinimalDenom: string };
  fetch: () => void;
}

interface QueryBalancesLike {
  getQueryEthereumHexAddress: (addr: string) => { balances: BalanceLike[] };
  getQueryBech32Address?: (addr: string) => { balances: BalanceLike[] };
}

export interface UseEvmTransferTxSubmitParams {
  sender: string;
  bech32Address?: string;
  coinMinimalDenom: string;
  historyType: string;
  ethereumAccount: EthereumAccountBase;
  sendConfigs: {
    feeConfig: EvmFeeConfigLike;
    gasConfig: { gas: number };
    amountConfig: { amount: CoinPretty[] };
    recipientConfig: { chainId: string; recipient: string };
    senderConfig: { sender: string };
    memoConfig: { memo: string };
  };
  queryBalances: QueryBalancesLike;
  nonceMethod?: "latest" | "pending";
}

export function useEvmTransferTxSubmit({
  sender,
  bech32Address,
  coinMinimalDenom,
  historyType,
  ethereumAccount,
  sendConfigs,
  queryBalances,
  nonceMethod,
}: UseEvmTransferTxSubmitParams) {
  const notification = useNotification();
  const intl = useIntl();

  const handleSubmit = useCallback(async () => {
    ethereumAccount.setIsSendingTx(true);
    const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } =
      sendConfigs.feeConfig.getEIP1559TxFees(sendConfigs.feeConfig.type);

    const unsignedTx = ethereumAccount.makeSendTokenTx({
      currency: sendConfigs.amountConfig.amount[0].currency,
      amount: sendConfigs.amountConfig.amount[0].toDec().toString(),
      to: sendConfigs.recipientConfig.recipient,
      gasLimit: sendConfigs.gasConfig.gas,
      maxFeePerGas: maxFeePerGas?.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
      gasPrice: gasPrice?.toString(),
    });
    await ethereumAccount.sendEthereumTx(
      sender,
      unsignedTx,
      {
        onFulfill: (txReceipt) => {
          queryBalances
            .getQueryEthereumHexAddress(sender)
            .balances.forEach((balance) => {
              if (
                balance.currency.coinMinimalDenom === coinMinimalDenom ||
                sendConfigs.feeConfig.fees.some(
                  (fee) =>
                    fee.currency.coinMinimalDenom ===
                    balance.currency.coinMinimalDenom
                )
              ) {
                balance.fetch();
              }
            });
          if (bech32Address && queryBalances.getQueryBech32Address) {
            queryBalances
              .getQueryBech32Address(bech32Address)
              .balances.forEach((balance) => {
                if (
                  balance.currency.coinMinimalDenom === coinMinimalDenom ||
                  sendConfigs.feeConfig.fees.some(
                    (fee) =>
                      fee.currency.coinMinimalDenom ===
                      balance.currency.coinMinimalDenom
                  )
                ) {
                  balance.fetch();
                }
              });
          }

          if (txReceipt.status === EthTxStatus.Success) {
            notification.show(
              "success",
              intl.formatMessage({
                id: "notification.transaction-success",
              }),
              ""
            );
          } else {
            notification.show(
              "failed",
              intl.formatMessage({ id: "error.transaction-failed" }),
              ""
            );
          }
        },
      },
      {
        sendTx: async (chainId, signedTx) => {
          const msg = new SendTxEthereumMsgAndRecordMsg(
            historyType,
            chainId,
            sendConfigs.recipientConfig.chainId,
            signedTx,
            sendConfigs.senderConfig.sender,
            sendConfigs.recipientConfig.recipient,
            sendConfigs.amountConfig.amount.map((amount) => {
              return {
                amount: DecUtils.getTenExponentN(amount.currency.coinDecimals)
                  .mul(amount.toDec())
                  .toString(),
                denom: amount.currency.coinMinimalDenom,
              };
            }),
            sendConfigs.memoConfig.memo
          );

          return await new InExtensionMessageRequester().sendMessage(
            BACKGROUND_PORT,
            msg
          );
        },
        nonceMethod,
      }
    );
    ethereumAccount.setIsSendingTx(false);
  }, [
    sender,
    bech32Address,
    coinMinimalDenom,
    historyType,
    ethereumAccount,
    sendConfigs,
    queryBalances,
    nonceMethod,
    notification,
    intl,
  ]);

  return { handleSubmit };
}
