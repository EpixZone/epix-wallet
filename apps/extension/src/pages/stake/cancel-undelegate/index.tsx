import { DSColor, DSTypography } from "@keplr-wallet/design-system";
import React, { FunctionComponent, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
import { ExtensionKVStore } from "@keplr-wallet/common";
import {
  useGasSimulator,
  useTxConfigsValidate,
  useCancelUndelegateTxConfig,
} from "@keplr-wallet/hooks";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { Gutter } from "../../../components/gutter";
import { Stack } from "../../../components/stack";
import { MemoInput } from "../../../components/input/memo-input";
import { FeeControl } from "../../../components/input/fee-control";
import { ValidatorCard } from "../components/validator-card";
import { useSubmitStakeTx } from "../hooks/use-submit-stake-tx";
import { useFeemarketGasAdjustment } from "../hooks/use-feemarket-gas-adjustment";

export const StakeCancelUndelegatePage: FunctionComponent = () => {
  const navigate = useNavigate();
  const { chainId, validatorAddress, creationHeight } = useParams<{
    chainId: string;
    validatorAddress: string;
    creationHeight: string;
  }>();

  useEffect(() => {
    if (!chainId || !validatorAddress || !creationHeight) {
      navigate("/stake", { replace: true });
    }
  }, [chainId, validatorAddress, creationHeight, navigate]);

  if (!chainId || !validatorAddress || !creationHeight) {
    return null;
  }

  return (
    <CancelUndelegateView
      chainId={chainId}
      validatorAddress={validatorAddress}
      creationHeight={creationHeight}
    />
  );
};

const CancelUndelegateView: FunctionComponent<{
  chainId: string;
  validatorAddress: string;
  creationHeight: string;
}> = observer(({ chainId, validatorAddress, creationHeight }) => {
  const { accountStore, chainStore, queriesStore } = useStore();
  const intl = useIntl();

  const account = accountStore.getAccount(chainId);
  const sender = account.bech32Address;

  const sendConfigs = useCancelUndelegateTxConfig(
    chainStore,
    queriesStore,
    chainId,
    sender,
    validatorAddress,
    creationHeight
  );

  const gasSimulator = useGasSimulator(
    new ExtensionKVStore("gas-simulator.screen.stake.cancel-undelegate"),
    chainStore,
    chainId,
    sendConfigs.gasConfig,
    sendConfigs.feeConfig,
    "native",
    () => {
      if (
        sendConfigs.amountConfig.uiProperties.error ||
        !sendConfigs.amountConfig.amount.length
      ) {
        throw new Error("Undelegation is unavailable");
      }
      return account.cosmos.makeCancelUndelegateTx(
        sendConfigs.amountConfig.amount[0].toDec().toString(),
        validatorAddress,
        creationHeight
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
      account.cosmos.makeCancelUndelegateTx(
        sendConfigs.amountConfig.amount[0].toDec().toString(),
        validatorAddress,
        creationHeight
      ),
  });

  return (
    <HeaderLayout
      title={intl.formatMessage({
        id: "page.stake.cancel-undelegate.title",
        defaultMessage: "Cancel undelegation",
      })}
      displayFlex={true}
      left={<BackButton />}
      bottomButtons={[
        {
          disabled: txConfigsValidate.interactionBlocked,
          text: intl.formatMessage({ id: "button.next" }),
          color: "primary",
          size: "large",
          type: "submit",
          isLoading: account.isSendingMsg === "cancelUndelegate",
        },
      ]}
      onSubmit={onSubmit}
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
          <DSTypography color={DSColor.typography.primary}>
            {sendConfigs.amountConfig.amount[0]?.trim(true).toString()}
          </DSTypography>
          {sendConfigs.amountConfig.uiProperties.error && (
            <DSTypography color={DSColor.typography.primary}>
              {sendConfigs.amountConfig.uiProperties.error.message}
            </DSTypography>
          )}
          <MemoInput
            memoConfig={sendConfigs.memoConfig}
            placeholder={intl.formatMessage({
              id: "components.input.memo-input.optional-placeholder",
            })}
          />
          <DSTypography color={DSColor.typography.secondary}>
            <FormattedMessage
              id="page.stake.cancel-undelegate.description"
              defaultMessage="This cancels the remaining amount of this undelegation and stakes it with the same validator again. To withdraw it later, you will need to start a new undelegation period."
            />
          </DSTypography>
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
