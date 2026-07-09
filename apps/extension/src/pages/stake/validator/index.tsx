import React, { FunctionComponent, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router";
import { FormattedMessage, useIntl } from "react-intl";
import { useTheme } from "styled-components";
import { Staking } from "@keplr-wallet/stores";
import { CoinPretty, Dec, RatePretty } from "@keplr-wallet/unit";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { XAxis, YAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { Stack } from "../../../components/stack";
import { Button } from "../../../components/button";
import { GuideBox } from "../../../components/guide-box";
import { Body3, Subtitle2, Subtitle3 } from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { ValidatorImage } from "../components/validator-image";
import { DelegatedCard } from "./delegated-card";
import { UnbondingCard } from "./unbonding-card";

export const StakeValidatorDetailPage: FunctionComponent = () => {
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
    <ValidatorDetailView
      chainId={chainId}
      validatorAddress={validatorAddress}
    />
  );
};

const ValidatorDetailView: FunctionComponent<{
  chainId: string;
  validatorAddress: string;
}> = observer(({ chainId, validatorAddress }) => {
  const { accountStore, chainStore, queriesStore } = useStore();
  const intl = useIntl();
  const navigate = useNavigate();
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

  const [validatorInfo, isJailed] = (() => {
    const bondedValidator = bondedValidators.validators
      .slice()
      .sort((a, b) => Number(b.tokens) - Number(a.tokens))
      .map((validator, i) => ({ ...validator, rank: i + 1 }))
      .find((val) => val.operator_address === validatorAddress);
    if (bondedValidator) {
      return [bondedValidator, false] as const;
    }

    const validator = unbondingValidators.validators
      .concat(unbondedValidators.validators)
      .sort((a, b) => Number(b.tokens) - Number(a.tokens))
      .map((val, i) => ({ ...val, rank: i + 1 }))
      .find((val) => val.operator_address === validatorAddress);
    return [validator, validator?.jailed === true] as const;
  })();

  const thumbnail =
    bondedValidators.getValidatorThumbnail(validatorAddress) ||
    unbondingValidators.getValidatorThumbnail(validatorAddress) ||
    unbondedValidators.getValidatorThumbnail(validatorAddress);

  const modularChainInfo = chainStore.getModularChain(chainId);
  const u = modularChainInfo.unwrapped;
  const stakeCurrency =
    u.type === "cosmos" || u.type === "ethermint"
      ? u.cosmos.stakeCurrency ?? u.cosmos.feeCurrencies[0]
      : undefined;

  const votingPower = stakeCurrency
    ? new CoinPretty(
        stakeCurrency,
        new Dec(validatorInfo?.delegator_shares || 0)
      )
    : undefined;

  const isCommissionHigh =
    Number(validatorInfo?.commission.commission_rates.rate) >= 0.2;
  const isTop10Validator = validatorInfo?.rank
    ? validatorInfo.rank <= 10
    : false;

  const staked = queries.cosmos.queryDelegations
    .getQueryBech32Address(account.bech32Address)
    .getDelegationTo(validatorAddress);

  const cardBackgroundColor =
    theme.mode === "light" ? ColorPalette["white"] : ColorPalette["gray-650"];

  return (
    <HeaderLayout
      title={intl.formatMessage({ id: "page.stake.validator-detail.title" })}
      left={<BackButton />}
    >
      <Box paddingX="0.75rem">
        <Gutter size="0.75rem" />

        <Stack gutter="0.75rem">
          {isJailed ? (
            <GuideBox
              title={intl.formatMessage({
                id: "page.stake.validator-detail.jailed-guide-box.title",
              })}
              paragraph={intl.formatMessage({
                id: "page.stake.validator-detail.jailed-guide-box.paragraph",
              })}
              color="danger"
            />
          ) : (
            <React.Fragment>
              {isCommissionHigh ? (
                <GuideBox
                  title={intl.formatMessage(
                    {
                      id: "page.stake.validator-detail.commission-guide-box.title",
                    },
                    {
                      rate: new RatePretty(
                        validatorInfo?.commission.commission_rates.rate || 0
                      )
                        .maxDecimals(2)
                        .toString(),
                    }
                  )}
                  paragraph={
                    <React.Fragment>
                      <FormattedMessage id="page.stake.validator-detail.commission-guide-box.paragraph-1" />
                      <span style={{ fontWeight: 700 }}>
                        <FormattedMessage id="page.stake.validator-detail.commission-guide-box.paragraph-2" />
                      </span>
                      <FormattedMessage id="page.stake.validator-detail.commission-guide-box.paragraph-3" />
                    </React.Fragment>
                  }
                  color="warning"
                />
              ) : null}
              {isTop10Validator ? (
                <GuideBox
                  title={intl.formatMessage({
                    id: "page.stake.validator-detail.top-10-guide-box.title",
                  })}
                  paragraph={intl.formatMessage({
                    id: "page.stake.validator-detail.top-10-guide-box.paragraph",
                  })}
                  color="default"
                />
              ) : null}
            </React.Fragment>
          )}

          {validatorInfo ? (
            <Box
              backgroundColor={cardBackgroundColor}
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
              <Stack gutter="1.25rem">
                <XAxis alignY="center">
                  <ValidatorImage
                    imageUrl={thumbnail}
                    name={validatorInfo.description.moniker}
                    size="2.5rem"
                    isDelegation={staked && !staked.toDec().isZero()}
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
                    {validatorInfo.description.moniker || validatorAddress}
                  </Subtitle2>
                </XAxis>

                <XAxis>
                  <Box style={{ flex: 1 }}>
                    <YAxis>
                      <Subtitle3 color={ColorPalette["gray-300"]}>
                        <FormattedMessage id="page.stake.validator-detail.validator-card.commission" />
                      </Subtitle3>
                      <Gutter size="0.5rem" />
                      <Body3
                        color={
                          theme.mode === "light"
                            ? ColorPalette["gray-500"]
                            : ColorPalette["gray-100"]
                        }
                      >
                        {new RatePretty(
                          validatorInfo.commission.commission_rates.rate
                        )
                          .maxDecimals(2)
                          .toString()}
                      </Body3>
                    </YAxis>
                  </Box>

                  <Box style={{ flex: 1 }}>
                    <YAxis>
                      <Subtitle3 color={ColorPalette["gray-300"]}>
                        <FormattedMessage id="page.stake.validator-detail.validator-card.voting-power" />
                      </Subtitle3>
                      <Gutter size="0.5rem" />
                      <Body3
                        color={
                          theme.mode === "light"
                            ? ColorPalette["gray-500"]
                            : ColorPalette["gray-100"]
                        }
                      >
                        {votingPower
                          ?.maxDecimals(10)
                          .trim(true)
                          .shrink(true)
                          .toString() || "-"}
                      </Body3>
                    </YAxis>
                  </Box>
                </XAxis>

                {validatorInfo.description.details ? (
                  <YAxis>
                    <Subtitle3 color={ColorPalette["gray-300"]}>
                      <FormattedMessage id="page.stake.validator-detail.validator-card.description" />
                    </Subtitle3>
                    <Gutter size="0.5rem" />
                    <Body3
                      color={
                        theme.mode === "light"
                          ? ColorPalette["gray-500"]
                          : ColorPalette["gray-100"]
                      }
                      style={{
                        wordBreak: "break-word",
                      }}
                    >
                      {validatorInfo.description.details}
                    </Body3>
                  </YAxis>
                ) : null}

                <Button
                  size="large"
                  color="primary"
                  text={
                    isJailed
                      ? intl.formatMessage({
                          id: "page.stake.validator-detail.jailed-button",
                        })
                      : intl.formatMessage({
                          id: "page.stake.validator-detail.stake-button",
                        })
                  }
                  disabled={isJailed}
                  onClick={() => {
                    navigate(`/stake/delegate/${chainId}/${validatorAddress}`);
                  }}
                />
              </Stack>
            </Box>
          ) : null}

          <DelegatedCard
            chainId={chainId}
            validatorAddress={validatorAddress}
          />
          <UnbondingCard
            chainId={chainId}
            validatorAddress={validatorAddress}
          />
        </Stack>

        <Gutter size="1.25rem" />
      </Box>
    </HeaderLayout>
  );
});
