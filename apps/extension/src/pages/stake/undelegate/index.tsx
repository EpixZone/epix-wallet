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
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { XAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { AmountInput } from "../../../components/input";
import { MemoInput } from "../../../components/input/memo-input";
import { GuideBox } from "../../../components/guide-box";
import { Body2 } from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { StakeTxLayout } from "../components/stake-tx-layout";
import { ValidatorCard } from "../components/validator-card";
import { useSubmitStakeTx } from "../hooks/use-submit-stake-tx";
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

  const onSubmit = useSubmitStakeTx({
    ...sendConfigs,
    interactionBlocked: txConfigsValidate.interactionBlocked,
    makeTx: () =>
      account.cosmos.makeUndelegateTx(
        sendConfigs.amountConfig.amount[0].toDec().toString(),
        sendConfigs.recipientConfig.recipient
      ),
  });

  return (
    <StakeTxLayout
      title={intl.formatMessage({ id: "page.stake.undelegate.title" })}
      isLoading={account.isSendingMsg === "undelegate"}
      interactionBlocked={txConfigsValidate.interactionBlocked}
      sendConfigs={sendConfigs}
      gasSimulator={gasSimulator}
      onSubmit={onSubmit}
    >
      <ValidatorCard chainId={chainId} validatorAddress={validatorAddress} />
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
    </StakeTxLayout>
  );
});
