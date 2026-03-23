import { useCallback } from "react";
import { DecUtils } from "@keplr-wallet/unit";
import {
  LogAnalyticsEventMsg,
  SendTxAndRecordMsg,
} from "@keplr-wallet/background";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT, Message } from "@keplr-wallet/router";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import {
  FeeConfig,
  IBCAmountConfig,
  IBCChannelConfig,
  IBCRecipientConfig,
  MemoConfig,
  SenderConfig,
} from "@keplr-wallet/hooks";
import { useStore } from "../../../../../stores";
import { useNotification } from "../../../../../hooks/notification";
import { useIntl } from "react-intl";
import { amountToAmbiguousAverage } from "../../../../../utils";
import { getShouldTopUpSignOptions } from "../../../../../utils/should-top-up-sign-options";
import { SendType } from "../../types";

interface IBCChannelFluent {
  destinationChainId: string;
  originDenom: string;
  originChainId: string;
  channels: {
    portId: string;
    channelId: string;
    counterpartyChainId: string;
  }[];
}

export interface UseCosmosTransferTxSubmitParams {
  chainId: string;
  sendType: SendType;
  historyType: string;
  shouldTopUp: boolean;
  ibcChannelFluent: IBCChannelFluent | undefined;
  sendConfigs: {
    feeConfig: FeeConfig;
    memoConfig: MemoConfig;
    channelConfig: IBCChannelConfig;
    amountConfig: IBCAmountConfig;
    recipientConfig: IBCRecipientConfig;
    senderConfig: SenderConfig;
  };
}

export function useCosmosTransferTxSubmit({
  chainId,
  sendType,
  historyType,
  shouldTopUp,
  ibcChannelFluent,
  sendConfigs,
}: UseCosmosTransferTxSubmitParams) {
  const { accountStore, chainStore, priceStore } = useStore();
  const notification = useNotification();
  const intl = useIntl();

  const handleSubmit = useCallback(async () => {
    const tx =
      sendType === "ibc-transfer"
        ? accountStore
            .getAccount(chainId)
            .cosmos.makePacketForwardIBCTransferTx(
              accountStore,
              sendConfigs.channelConfig.channels,
              sendConfigs.amountConfig.amount[0].toDec().toString(),
              sendConfigs.amountConfig.amount[0].currency,
              sendConfigs.recipientConfig.recipient
            )
        : accountStore
            .getAccount(chainId)
            .makeSendTokenTx(
              sendConfigs.amountConfig.amount[0].toDec().toString(),
              sendConfigs.amountConfig.amount[0].currency,
              sendConfigs.recipientConfig.recipient
            );

    await tx.send(
      sendConfigs.feeConfig.topUpStatus.topUpOverrideStdFee ??
        sendConfigs.feeConfig.toStdFee(),
      sendConfigs.memoConfig.memo,
      {
        preferNoSetFee: true,
        preferNoSetMemo: true,
        ...(shouldTopUp ? getShouldTopUpSignOptions() : {}),
        sendTx: async (chainId, tx, mode) => {
          let msg: Message<Uint8Array> = new SendTxAndRecordMsg(
            historyType,
            chainId,
            sendConfigs.recipientConfig.chainId,
            tx,
            mode,
            false,
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
          if (sendType === "ibc-transfer") {
            if (msg instanceof SendTxAndRecordMsg) {
              msg = msg.withIBCPacketForwarding(
                sendConfigs.channelConfig.channels,
                {
                  currencies: chainStore.getModularChain(chainId).currencies,
                }
              );
            } else {
              throw new Error("Invalid message type");
            }
          }
          return await new InExtensionMessageRequester().sendMessage(
            BACKGROUND_PORT,
            msg
          );
        },
      },
      {
        onBroadcasted: async () => {
          chainStore.enableVaultsWithCosmosAddress(
            sendConfigs.recipientConfig.chainId,
            sendConfigs.recipientConfig.recipient
          );

          if (sendType === "send") {
            const inCurrencyPrice = await priceStore.waitCalculatePrice(
              sendConfigs.amountConfig.amount[0],
              "usd"
            );

            const params: Record<
              string,
              number | string | boolean | number[] | string[] | undefined
            > = {
              denom:
                sendConfigs.amountConfig.amount[0].currency.coinMinimalDenom,
              commonDenom: (() => {
                const currency = sendConfigs.amountConfig.amount[0].currency;
                if ("paths" in currency && currency.originCurrency) {
                  return currency.originCurrency.coinDenom;
                }
                return currency.coinDenom;
              })(),
              chainId: sendConfigs.recipientConfig.chainId,
              chainIdentifier: ChainIdHelper.parse(
                sendConfigs.recipientConfig.chainId
              ).identifier,
              inAvg: amountToAmbiguousAverage(
                sendConfigs.amountConfig.amount[0]
              ),
            };
            if (inCurrencyPrice) {
              params["inFiatAvg"] = amountToAmbiguousAverage(inCurrencyPrice);
            }
            new InExtensionMessageRequester().sendMessage(
              BACKGROUND_PORT,
              new LogAnalyticsEventMsg("send", params)
            );
          } else if (ibcChannelFluent != null) {
            const pathChainIds = [chainId].concat(
              ...ibcChannelFluent.channels.map(
                (channel) => channel.counterpartyChainId
              )
            );
            const intermediateChainIds: string[] = [];
            if (pathChainIds.length > 2) {
              intermediateChainIds.push(...pathChainIds.slice(1, -1));
            }

            const inCurrencyPrice = await priceStore.waitCalculatePrice(
              sendConfigs.amountConfig.amount[0],
              "usd"
            );

            const params: Record<
              string,
              number | string | boolean | number[] | string[] | undefined
            > = {
              originDenom: ibcChannelFluent.originDenom,
              originCommonDenom: (() => {
                const currency = chainStore
                  .getModularChain(ibcChannelFluent.originChainId)
                  .forceFindCurrency(ibcChannelFluent.originDenom);
                if ("paths" in currency && currency.originCurrency) {
                  return currency.originCurrency.coinDenom;
                }
                return currency.coinDenom;
              })(),
              originChainId: ibcChannelFluent.originChainId,
              originChainIdentifier: ChainIdHelper.parse(
                ibcChannelFluent.originChainId
              ).identifier,
              sourceChainId: chainId,
              sourceChainIdentifier: ChainIdHelper.parse(chainId).identifier,
              destinationChainId: ibcChannelFluent.destinationChainId,
              destinationChainIdentifier: ChainIdHelper.parse(
                ibcChannelFluent.destinationChainId
              ).identifier,
              pathChainIds,
              pathChainIdentifiers: pathChainIds.map(
                (chainId) => ChainIdHelper.parse(chainId).identifier
              ),
              intermediateChainIds,
              intermediateChainIdentifiers: intermediateChainIds.map(
                (chainId) => ChainIdHelper.parse(chainId).identifier
              ),
              isToOrigin:
                ibcChannelFluent.destinationChainId ===
                ibcChannelFluent.originChainId,
              inAvg: amountToAmbiguousAverage(
                sendConfigs.amountConfig.amount[0]
              ),
            };
            if (inCurrencyPrice) {
              params["inFiatAvg"] = amountToAmbiguousAverage(inCurrencyPrice);
            }
            new InExtensionMessageRequester().sendMessage(
              BACKGROUND_PORT,
              new LogAnalyticsEventMsg("ibc_send", params)
            );

            if (sendConfigs.recipientConfig.nameServiceResult.length > 0) {
              new InExtensionMessageRequester().sendMessage(
                BACKGROUND_PORT,
                new LogAnalyticsEventMsg("send_with_name_service", {
                  chainId: sendConfigs.recipientConfig.chainId,
                  nameService:
                    sendConfigs.recipientConfig.nameServiceResult[0].type,
                })
              );
            }
          }
        },
        onFulfill: (tx: any) => {
          if (tx.code != null && tx.code !== 0) {
            console.log(tx.log ?? tx.raw_log);
            notification.show(
              "failed",
              intl.formatMessage({ id: "error.transaction-failed" }),
              ""
            );
            return;
          }
          notification.show(
            "success",
            intl.formatMessage({
              id: "notification.transaction-success",
            }),
            ""
          );
        },
      }
    );
  }, [
    chainId,
    sendType,
    historyType,
    shouldTopUp,
    ibcChannelFluent,
    sendConfigs,
    accountStore,
    chainStore,
    priceStore,
    notification,
    intl,
  ]);

  return { handleSubmit };
}
