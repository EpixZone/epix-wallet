import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
import { useTheme } from "styled-components";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { XAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { Button } from "../../../components/button";
import { Body2, Subtitle3 } from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { CoinPretty } from "@keplr-wallet/unit";
import { ChainIdHelper } from "@keplr-wallet/cosmos";

export const DelegatedCard: FunctionComponent<{
  chainId: string;
  validatorAddress: string;
}> = observer(({ chainId, validatorAddress }) => {
  const { accountStore, queriesStore } = useStore();
  const intl = useIntl();
  const navigate = useNavigate();
  const theme = useTheme();

  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);

  const staked = queries.cosmos.queryDelegations
    .getQueryBech32Address(account.bech32Address)
    .getDelegationTo(validatorAddress);

  const queryRewards = queries.cosmos.queryRewards.getQueryBech32Address(
    account.bech32Address
  );

  const rewardsText = (() => {
    let reward: CoinPretty | undefined;
    // dydx pays staking rewards in USDC rather than the stake currency, so
    // getStakableRewardOf returns undefined there. Same special case as the
    // mobile app.
    const isDydx = ChainIdHelper.parse(chainId).identifier === "dydx-mainnet";
    if (isDydx) {
      const denom =
        "ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5";
      reward = queryRewards
        .getRewardsOf(validatorAddress)
        .find((r) => r.currency.coinMinimalDenom === denom);
    } else {
      reward = queryRewards.getStakableRewardOf(validatorAddress);
    }
    return !reward && isDydx
      ? "0 USDC"
      : reward
          ?.trim(true)
          .shrink(true)
          .maxDecimals(6)
          .inequalitySymbol(true)
          .hideIBCMetadata(true)
          .toString();
  })();

  if (!staked || staked.toDec().isZero()) {
    return null;
  }

  return (
    <Box>
      <Box paddingX="0.375rem" paddingY="0.25rem">
        <Subtitle3 color={ColorPalette["gray-300"]}>
          <FormattedMessage id="page.stake.validator-detail.delegated-card.label" />
        </Subtitle3>
      </Box>
      <Gutter size="0.5rem" />
      <Box
        backgroundColor={
          theme.mode === "light"
            ? ColorPalette["white"]
            : ColorPalette["gray-650"]
        }
        style={{
          boxShadow:
            theme.mode === "light"
              ? "0 1px 4px 0 rgba(43,39,55,0.1)"
              : undefined,
        }}
        borderRadius="0.375rem"
        paddingX="1rem"
        paddingY="1.25rem"
      >
        <XAxis alignY="center">
          <Body2 color={ColorPalette["gray-300"]}>
            <FormattedMessage id="page.stake.validator-detail.delegated-card.staked-label" />
          </Body2>
          <div style={{ flex: 1 }} />
          <Body2
            color={
              theme.mode === "light"
                ? ColorPalette["gray-700"]
                : ColorPalette["gray-10"]
            }
          >
            {staked
              .trim(true)
              .shrink(true)
              .maxDecimals(6)
              .inequalitySymbol(true)
              .toString()}
          </Body2>
        </XAxis>

        <Gutter size="0.5rem" />

        <XAxis alignY="center">
          <Body2 color={ColorPalette["gray-300"]}>
            <FormattedMessage id="page.stake.validator-detail.delegated-card.reward-label" />
          </Body2>
          <div style={{ flex: 1 }} />
          <Body2
            color={
              theme.mode === "light"
                ? ColorPalette["gray-700"]
                : ColorPalette["gray-10"]
            }
          >
            {rewardsText ?? "-"}
          </Body2>
        </XAxis>

        <Gutter size="1rem" />

        <XAxis>
          <Box style={{ flex: 1 }}>
            <Button
              color="secondary"
              size="large"
              text={intl.formatMessage({
                id: "page.stake.validator-detail.delegated-card.redelegate-button",
              })}
              onClick={() => {
                navigate(`/stake/redelegate/${chainId}/${validatorAddress}`);
              }}
            />
          </Box>
          <Gutter size="0.625rem" />
          <Box style={{ flex: 1 }}>
            <Button
              color="primary"
              size="large"
              text={intl.formatMessage({
                id: "page.stake.validator-detail.delegated-card.undelegate-button",
              })}
              onClick={() => {
                navigate(`/stake/undelegate/${chainId}/${validatorAddress}`);
              }}
            />
          </Box>
        </XAxis>
      </Box>
    </Box>
  );
});
