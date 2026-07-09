import React, { FunctionComponent, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router";
import { useSearchParams } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import styled, { useTheme } from "styled-components";
import { Staking } from "@keplr-wallet/stores";
import { ExtensionKVStore } from "@keplr-wallet/common";
import {
  useGasSimulator,
  useRedelegateTxConfig,
  useTxConfigsValidate,
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
import { Body2, Subtitle2, Subtitle3 } from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { ArrowRightIcon } from "../../../components/icon";
import { ValidatorCard } from "../components/validator-card";
import { ValidatorImage } from "../components/validator-image";
import { useFeemarketGasAdjustment } from "../hooks/use-feemarket-gas-adjustment";
import { COMMON_HOVER_OPACITY } from "../../../styles/constant";

export const StakeRedelegatePage: FunctionComponent = () => {
  const navigate = useNavigate();
  const { chainId, validatorAddress } = useParams<{
    chainId: string;
    validatorAddress: string;
  }>();
  const [searchParams] = useSearchParams();
  const dstValidatorAddress = searchParams.get("dst") || "";
  // Amount/memo typed before opening the destination picker survive the
  // round-trip through /stake/validators?mode=select as query params.
  const initialAmount = searchParams.get("amount") || "";
  const initialMemo = searchParams.get("memo") || "";

  useEffect(() => {
    if (!chainId || !validatorAddress) {
      navigate("/stake", { replace: true });
    }
  }, [chainId, validatorAddress, navigate]);

  if (!chainId || !validatorAddress) {
    return null;
  }

  return (
    <RedelegateView
      chainId={chainId}
      validatorAddress={validatorAddress}
      dstValidatorAddress={dstValidatorAddress}
      initialAmount={initialAmount}
      initialMemo={initialMemo}
    />
  );
};

const RedelegateView: FunctionComponent<{
  chainId: string;
  validatorAddress: string;
  dstValidatorAddress: string;
  initialAmount: string;
  initialMemo: string;
}> = observer(
  ({
    chainId,
    validatorAddress,
    dstValidatorAddress,
    initialAmount,
    initialMemo,
  }) => {
    const { accountStore, chainStore, queriesStore } = useStore();
    const intl = useIntl();
    const navigate = useNavigate();

    const account = accountStore.getAccount(chainId);
    const sender = account.bech32Address;

    const sendConfigs = useRedelegateTxConfig(
      chainStore,
      queriesStore,
      chainId,
      sender,
      validatorAddress,
      300000
    );

    useEffect(() => {
      sendConfigs.recipientConfig.setValue(dstValidatorAddress);
    }, [dstValidatorAddress, sendConfigs.recipientConfig]);

    // Restore the amount/memo carried through the destination picker
    // round-trip. Mount-only on purpose.
    useEffect(() => {
      if (initialAmount) {
        sendConfigs.amountConfig.setValue(initialAmount);
      }
      if (initialMemo) {
        sendConfigs.memoConfig.setValue(initialMemo);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const gasSimulator = useGasSimulator(
      new ExtensionKVStore("gas-simulator.screen.stake.redelegate/redelegate"),
      chainStore,
      chainId,
      sendConfigs.gasConfig,
      sendConfigs.feeConfig,
      "native",
      () => {
        return account.cosmos.makeBeginRedelegateTx(
          sendConfigs.amountConfig.amount[0].toDec().toString(),
          validatorAddress,
          dstValidatorAddress
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
        title={intl.formatMessage({ id: "page.stake.redelegate.title" })}
        displayFlex={true}
        left={<BackButton />}
        bottomButtons={[
          {
            disabled: txConfigsValidate.interactionBlocked,
            text: intl.formatMessage({ id: "button.next" }),
            color: "primary",
            size: "large",
            type: "submit",
            isLoading: account.isSendingMsg === "redelegate",
          },
        ]}
        onSubmit={async (e) => {
          e.preventDefault();

          if (txConfigsValidate.interactionBlocked) {
            return;
          }

          const tx = account.cosmos.makeBeginRedelegateTx(
            sendConfigs.amountConfig.amount[0].toDec().toString(),
            validatorAddress,
            dstValidatorAddress
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

            <Box>
              <Box paddingLeft="0.5rem" marginBottom="0.375rem">
                <Subtitle3 color={ColorPalette["gray-300"]}>
                  <FormattedMessage id="page.stake.redelegate.select-validator-card.label" />
                </Subtitle3>
              </Box>
              <DstValidatorItem
                chainId={chainId}
                dstValidatorAddress={dstValidatorAddress}
                onClick={() => {
                  // Carry the typed amount/memo through the picker so they
                  // survive the select round-trip.
                  navigate(
                    `/stake/validators?chainId=${chainId}&mode=select&src=${validatorAddress}&amount=${encodeURIComponent(
                      sendConfigs.amountConfig.value
                    )}&memo=${encodeURIComponent(sendConfigs.memoConfig.value)}`
                  );
                }}
              />
            </Box>

            <AmountInput amountConfig={sendConfigs.amountConfig} />
            <MemoInput
              memoConfig={sendConfigs.memoConfig}
              placeholder={intl.formatMessage({
                id: "components.input.memo-input.optional-placeholder",
              })}
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
  }
);

const DstItemContainer = styled(Box)`
  cursor: pointer;

  &:hover {
    opacity: ${COMMON_HOVER_OPACITY};
  }
`;

const DstValidatorItem: FunctionComponent<{
  chainId: string;
  dstValidatorAddress: string;
  onClick: () => void;
}> = observer(({ chainId, dstValidatorAddress, onClick }) => {
  const { queriesStore } = useStore();
  const theme = useTheme();

  const bondedValidators = queriesStore
    .get(chainId)
    .cosmos.queryValidators.getQueryStatus(Staking.BondStatus.Bonded);

  const dstValidator = dstValidatorAddress
    ? bondedValidators.getValidator(dstValidatorAddress)
    : undefined;

  return (
    <DstItemContainer
      backgroundColor={
        theme.mode === "light"
          ? ColorPalette["white"]
          : ColorPalette["gray-650"]
      }
      style={{
        boxShadow:
          theme.mode === "light" ? "0 1px 4px 0 rgba(43,39,55,0.1)" : undefined,
      }}
      borderRadius="0.375rem"
      padding="1rem"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      <XAxis alignY="center">
        {dstValidatorAddress ? (
          <React.Fragment>
            <ValidatorImage
              imageUrl={bondedValidators.getValidatorThumbnail(
                dstValidatorAddress
              )}
              name={dstValidator?.description.moniker || dstValidatorAddress}
            />
            <Gutter size="0.75rem" />
            <Subtitle2
              color={
                theme.mode === "light"
                  ? ColorPalette["gray-700"]
                  : ColorPalette["gray-10"]
              }
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {dstValidator?.description.moniker || dstValidatorAddress}
            </Subtitle2>
          </React.Fragment>
        ) : (
          <Body2 color={ColorPalette["gray-300"]}>
            <FormattedMessage id="page.stake.redelegate.select-validator-card.placeholder" />
          </Body2>
        )}

        <div style={{ flex: 1 }} />

        <ArrowRightIcon
          width="1.5rem"
          height="1.5rem"
          color={ColorPalette["gray-300"]}
        />
      </XAxis>
    </DstItemContainer>
  );
});
