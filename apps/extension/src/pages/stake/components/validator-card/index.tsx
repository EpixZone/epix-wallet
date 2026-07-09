import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { useTheme } from "styled-components";
import { FormattedMessage } from "react-intl";
import { Staking } from "@keplr-wallet/stores";
import { useStore } from "../../../../stores";
import { Box } from "../../../../components/box";
import { XAxis } from "../../../../components/axis";
import { Gutter } from "../../../../components/gutter";
import { Body2, Subtitle2 } from "../../../../components/typography";
import { ColorPalette } from "../../../../styles";
import { ValidatorImage } from "../validator-image";
import { CoinPretty } from "@keplr-wallet/unit";
import { ChainIdHelper } from "@keplr-wallet/cosmos";

export const ValidatorCard: FunctionComponent<{
  chainId: string;
  validatorAddress: string;
}> = observer(({ chainId, validatorAddress }) => {
  const { accountStore, queriesStore } = useStore();
  const theme = useTheme();

  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );
  const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonding
  );
  const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonded
  );

  const validatorInfo =
    bondedValidators.getValidator(validatorAddress) ||
    unbondingValidators.getValidator(validatorAddress) ||
    unbondedValidators.getValidator(validatorAddress);

  const thumbnail =
    bondedValidators.getValidatorThumbnail(validatorAddress) ||
    unbondingValidators.getValidatorThumbnail(validatorAddress) ||
    unbondedValidators.getValidatorThumbnail(validatorAddress);

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

  const hasStaked = staked && !staked.toDec().isZero();

  return (
    <Box
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
      paddingX="1rem"
      paddingY="1.25rem"
    >
      <XAxis alignY="center">
        <ValidatorImage
          imageUrl={thumbnail}
          name={validatorInfo?.description.moniker}
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
          {validatorInfo?.description.moniker || validatorAddress}
        </Subtitle2>
      </XAxis>

      {hasStaked ? (
        <React.Fragment>
          <Gutter size="1rem" />
          <Box
            style={{
              borderTop: `1px solid ${
                theme.mode === "light"
                  ? ColorPalette["gray-100"]
                  : ColorPalette["gray-500"]
              }`,
            }}
          />
          <Gutter size="1rem" />

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
        </React.Fragment>
      ) : null}
    </Box>
  );
});
