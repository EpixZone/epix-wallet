import React, { FunctionComponent, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router";
import { useIntl } from "react-intl";
import { ExtensionKVStore } from "@keplr-wallet/common";
import {
  useDelegateTxConfig,
  useGasSimulator,
  useTxConfigsValidate,
} from "@keplr-wallet/hooks";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { Gutter } from "../../../components/gutter";
import { Stack } from "../../../components/stack";
import { AmountInput } from "../../../components/input";
import { MemoInput } from "../../../components/input/memo-input";
import { FeeControl } from "../../../components/input/fee-control";
import { GuideBox } from "../../../components/guide-box";
import { ValidatorCard } from "../components/validator-card";
import { useFeemarketGasAdjustment } from "../hooks/use-feemarket-gas-adjustment";

export const StakeDelegatePage: FunctionComponent = () => {
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

  return <DelegateView chainId={chainId} validatorAddress={validatorAddress} />;
};

const DelegateView: FunctionComponent<{
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

  const sendConfigs = useDelegateTxConfig(
    chainStore,
    queriesStore,
    chainId,
    sender,
    validatorAddress,
    300000,
    false
  );

  const gasSimulator = useGasSimulator(
    new ExtensionKVStore("gas-simulator.screen.stake.delegate/delegate"),
    chainStore,
    chainId,
    sendConfigs.gasConfig,
    sendConfigs.feeConfig,
    "native",
    () => {
      return account.cosmos.makeDelegateTx(
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
      title={intl.formatMessage({ id: "page.stake.delegate.title" })}
      displayFlex={true}
      left={<BackButton />}
      bottomButtons={[
        {
          disabled: txConfigsValidate.interactionBlocked,
          text: intl.formatMessage({ id: "button.next" }),
          color: "primary",
          size: "large",
          type: "submit",
          isLoading: account.isSendingMsg === "delegate",
        },
      ]}
      onSubmit={async (e) => {
        e.preventDefault();

        if (txConfigsValidate.interactionBlocked) {
          return;
        }

        const tx = account.cosmos.makeDelegateTx(
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
            title={intl.formatMessage(
              { id: "page.stake.delegate.guide-box.title" },
              { unbondingPeriodDay }
            )}
            paragraph={intl.formatMessage(
              { id: "page.stake.delegate.guide-box.paragraph" },
              { unbondingPeriodDay }
            )}
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
