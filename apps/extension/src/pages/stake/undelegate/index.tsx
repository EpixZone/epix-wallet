import React, { FunctionComponent, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
import { ExtensionKVStore } from "@keplr-wallet/common";
import {
  useGasSimulator,
  useTxConfigsValidate,
  useUndelegateTxConfig,
} from "@keplr-wallet/hooks";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { XAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { Stack } from "../../../components/stack";
import { AmountInput } from "../../../components/input";
import { MemoInput } from "../../../components/input/memo-input";
import { FeeControl } from "../../../components/input/fee-control";
import { GuideBox } from "../../../components/guide-box";
import { Body2 } from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { ValidatorCard } from "../components/validator-card";
import { useFeemarketGasAdjustment } from "../hooks/use-feemarket-gas-adjustment";

export const StakeUndelegatePage: FunctionComponent = () => {
  const navigate = useNavigate();
  const { chainId, validatorAddress } = useParams<{
    chainId: string;
    validatorAddress: string;
  }>();

  useEffect(() => {
    if (!chainId || !validatorAddress) {
      navigate("/stake", { replace: true });
    }
  }, [chainId, validatorAddress, navigate]);

  if (!chainId || !validatorAddress) {
    return null;
  }

  return (
    <UndelegateView chainId={chainId} validatorAddress={validatorAddress} />
  );
};

const UndelegateView: FunctionComponent<{
  chainId: string;
  validatorAddress: string;
}> = observer(({ chainId, validatorAddress }) => {
  const { accountStore, chainStore, queriesStore } = useStore();
  const intl = useIntl();
  const navigate = useNavigate();

  const account = accountStore.getAccount(chainId);
  const sender = account.bech32Address;
  const queries = queriesStore.get(chainId);

  const unbondingPeriodDay = queries.cosmos.queryStakingParams.response
    ? queries.cosmos.queryStakingParams.unbondingTimeSec / (3600 * 24)
    : 21;

  const sendConfigs = useUndelegateTxConfig(
    chainStore,
    queriesStore,
    chainId,
    sender,
    validatorAddress,
    300000
  );

  const gasSimulator = useGasSimulator(
    new ExtensionKVStore("gas-simulator.screen.stake.undelegate/undelegate"),
    chainStore,
    chainId,
    sendConfigs.gasConfig,
    sendConfigs.feeConfig,
    "native",
    () => {
      return account.cosmos.makeUndelegateTx(
        sendConfigs.amountConfig.amount[0].toDec().toString(),
        sendConfigs.recipientConfig.recipient
      );
    }
  );

  useFeemarketGasAdjustment(chainId, gasSimulator, sendConfigs.feeConfig);

  const txConfigsValidate = useTxConfigsValidate({
    ...sendConfigs,
    gasSimulator,
  });

  return (
    <HeaderLayout
      title={intl.formatMessage({ id: "page.stake.undelegate.title" })}
      displayFlex={true}
      left={<BackButton />}
      bottomButtons={[
        {
          disabled: txConfigsValidate.interactionBlocked,
          text: intl.formatMessage({ id: "button.next" }),
          color: "primary",
          size: "large",
          type: "submit",
          isLoading: account.isSendingMsg === "undelegate",
        },
      ]}
      onSubmit={async (e) => {
        e.preventDefault();

        if (txConfigsValidate.interactionBlocked) {
          return;
        }

        const tx = account.cosmos.makeUndelegateTx(
          sendConfigs.amountConfig.amount[0].toDec().toString(),
          sendConfigs.recipientConfig.recipient
        );

        try {
          await tx.send(
            sendConfigs.feeConfig.toStdFee(),
            sendConfigs.memoConfig.memo,
            {
              preferNoSetFee: true,
              preferNoSetMemo: true,
            },
            {
              onBroadcasted: () => {
                navigate("/tx-result/pending");
              },
              onFulfill: (tx: any) => {
                if (tx.code != null && tx.code !== 0) {
                  console.log(tx.log ?? tx.raw_log);
                  navigate("/tx-result/failed");
                  return;
                }

                navigate("/tx-result/success");
              },
            }
          );
        } catch (e) {
          if (e?.message === "Request rejected") {
            return;
          }

          console.log(e);
          navigate("/tx-result/failed");
        }
      }}
    >
      <Box
        paddingX="0.75rem"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Gutter size="0.75rem" />

        <Stack gutter="0.75rem">
          <ValidatorCard
            chainId={chainId}
            validatorAddress={validatorAddress}
          />
          <AmountInput amountConfig={sendConfigs.amountConfig} />
          <MemoInput
            memoConfig={sendConfigs.memoConfig}
            placeholder={intl.formatMessage({
              id: "components.input.memo-input.optional-placeholder",
            })}
          />
          <GuideBox
            color="warning"
            title={intl.formatMessage({
              id: "page.stake.undelegate.guide-box.title",
            })}
            paragraph={
              <Box>
                <XAxis>
                  <Body2 color={ColorPalette["yellow-500"]}>•</Body2>
                  <Gutter size="0.25rem" />
                  <Body2 color={ColorPalette["yellow-500"]}>
                    <FormattedMessage id="page.stake.undelegate.guide-box.paragraph-1" />
                  </Body2>
                </XAxis>
                <XAxis>
                  <Body2 color={ColorPalette["yellow-500"]}>•</Body2>
                  <Gutter size="0.25rem" />
                  <Body2 color={ColorPalette["yellow-500"]}>
                    <FormattedMessage
                      id="page.stake.undelegate.guide-box.paragraph-2"
                      values={{ unbondingPeriodDay }}
                    />
                  </Body2>
                </XAxis>
              </Box>
            }
          />
        </Stack>

        <div style={{ flex: 1 }} />

        <FeeControl
          senderConfig={sendConfigs.senderConfig}
          feeConfig={sendConfigs.feeConfig}
          gasConfig={sendConfigs.gasConfig}
          gasSimulator={gasSimulator}
        />

        <Gutter size="1rem" />
      </Box>
    </HeaderLayout>
  );
});
