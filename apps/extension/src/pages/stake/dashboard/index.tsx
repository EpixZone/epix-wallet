import React, { FunctionComponent, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { useIntl } from "react-intl";
import { useTheme } from "styled-components";
import { Staking } from "@keplr-wallet/stores";
import { CoinPretty } from "@keplr-wallet/unit";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { XAxis, YAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { Stack } from "../../../components/stack";
import { Button } from "../../../components/button";
import { CollapsibleList } from "../../../components/collapsible-list";
import { Skeleton } from "../../../components/skeleton";
import { MainH1 } from "../../../components/typography/main-h1";
import {
  Body3,
  Subtitle2,
  Subtitle3,
  Subtitle4,
} from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { TokenTitleView } from "../../main/components";
import { useIsNotReady } from "../../main";
import { ValidatorItem, ViewValidator } from "../components/validator-item";
import { StakingIcon } from "../components/staking-icon";
import { formatRelativeTimeString } from "../utils";

export const StakeDashboardPage: FunctionComponent<{
  chainId: string;
}> = observer(({ chainId }) => {
  const { accountStore, queriesStore, chainStore, priceStore, aprsStore } =
    useStore();
  const intl = useIntl();
  const navigate = useNavigate();
  const theme = useTheme();
  const isNotReady = useIsNotReady();

  const modularChainInfo = chainStore.getModularChain(chainId);
  const u = modularChainInfo.unwrapped;
  const stakeCurrency =
    u.type === "cosmos" || u.type === "ethermint"
      ? u.cosmos.stakeCurrency
      : undefined;

  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);

  const stakableBalance = queries.queryBalances.getQueryBech32Address(
    account.bech32Address
  ).stakable?.balance;

  const totalUnbonding =
    queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(
      account.bech32Address
    ).total;
  const totalDelegation = queries.cosmos.queryDelegations.getQueryBech32Address(
    account.bech32Address
  ).total;

  const totalStaked = totalUnbonding
    ? totalDelegation?.add(totalUnbonding)
    : totalDelegation;

  const totalStakedPrice = totalStaked
    ? priceStore.calculatePrice(totalStaked)
    : undefined;

  const apr = aprsStore.getApr(chainId);

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );
  const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonding
  );
  const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Unbonded
  );

  const validatorsMap = useMemo(() => {
    const map: Map<string, Staking.Validator> = new Map();

    for (const val of bondedValidators.validators
      .concat(unbondingValidators.validators)
      .concat(unbondedValidators.validators)) {
      map.set(val.operator_address, val);
    }

    return map;
  }, [
    bondedValidators.validators,
    unbondingValidators.validators,
    unbondedValidators.validators,
  ]);

  const queryDelegations =
    queries.cosmos.queryDelegations.getQueryBech32Address(
      account.bech32Address
    );
  const queryUnbondings =
    queries.cosmos.queryUnbondingDelegations.getQueryBech32Address(
      account.bech32Address
    );

  // Not memoized on purpose: the query results are mobx observables, so
  // they must be read during every render for the observer to track them.
  const delegations: ViewValidator[] = (() => {
    const res: ViewValidator[] = [];
    for (const delegation of queryDelegations.delegations) {
      const validator = validatorsMap.get(
        delegation.delegation.validator_address
      );
      if (!validator) {
        continue;
      }

      const amount = queryDelegations.getDelegationTo(
        validator.operator_address
      );

      res.push({
        coin: amount,
        name: validator.description.moniker,
        validatorAddress: validator.operator_address,
        subString: amount
          ? priceStore.calculatePrice(amount)?.inequalitySymbol(true).toString()
          : undefined,
        isDelegation: true,
      });
    }
    return res;
  })();

  const unbondings: ViewValidator[] = (() => {
    if (!stakeCurrency) {
      return [];
    }

    const res: ViewValidator[] = [];
    for (const unbonding of queryUnbondings.unbondings) {
      for (const entry of unbonding.entries) {
        const validator = validatorsMap.get(unbonding.validator_address);
        if (!validator) {
          continue;
        }

        res.push({
          coin: new CoinPretty(stakeCurrency, entry.balance),
          name: validator.description.moniker,
          validatorAddress: validator.operator_address,
          subString: formatRelativeTimeString(intl, entry.completion_time),
        });
      }
    }
    return res;
  })();

  const validatorViewData: {
    title: string;
    validators: ViewValidator[];
    key: string;
  }[] = [
    {
      title: intl.formatMessage({ id: "page.stake.staked-balance-title" }),
      validators: delegations,
      key: "delegations",
    },
    {
      title: intl.formatMessage({ id: "page.stake.unstaking-balance-title" }),
      validators: unbondings,
      key: "unbondings",
    },
  ];

  return (
    <HeaderLayout
      title={intl.formatMessage(
        { id: "page.stake.dashboard.title" },
        { chainName: modularChainInfo.chainName }
      )}
      left={<BackButton />}
    >
      <Box paddingX="0.75rem">
        <YAxis alignX="center">
          <Gutter size="1.25rem" />

          {apr ? (
            <Skeleton isNotReady={isNotReady}>
              <Box
                borderRadius="1rem"
                backgroundColor={
                  theme.mode === "light"
                    ? ColorPalette["gray-50"]
                    : ColorPalette["gray-600"]
                }
                paddingX="0.75rem"
                paddingY="0.375rem"
              >
                <Body3
                  color={
                    theme.mode === "light"
                      ? ColorPalette["gray-400"]
                      : ColorPalette["gray-200"]
                  }
                >
                  {`APR ${apr.toString(2)}%`}
                </Body3>
              </Box>
            </Skeleton>
          ) : null}

          <Gutter size="1rem" />

          <Subtitle3 color={ColorPalette["gray-200"]}>
            {intl.formatMessage({ id: "page.stake.total-staked-title" })}
          </Subtitle3>

          <Gutter size="0.375rem" />

          <Skeleton isNotReady={isNotReady} dummyMinWidth="6rem">
            <MainH1
              color={
                theme.mode === "light"
                  ? ColorPalette["gray-700"]
                  : ColorPalette["white"]
              }
            >
              {totalStaked?.maxDecimals(6).trim(true).shrink(true).toString() ||
                "-"}
            </MainH1>
          </Skeleton>

          {totalStakedPrice ? (
            <React.Fragment>
              <Gutter size="0.25rem" />
              <Subtitle3 color={ColorPalette["gray-300"]}>
                {totalStakedPrice.toString()}
              </Subtitle3>
            </React.Fragment>
          ) : null}

          <Gutter size="1.5rem" />
        </YAxis>

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
          padding="1rem"
        >
          <XAxis alignY="center">
            <Box
              width="2.25rem"
              height="2.25rem"
              borderRadius="50%"
              alignX="center"
              alignY="center"
              backgroundColor={ColorPalette["purple-400"]}
              style={{
                flexShrink: 0,
              }}
            >
              <StakingIcon
                width="1.125rem"
                height="1.125rem"
                color={ColorPalette["white"]}
              />
            </Box>

            <Gutter size="0.75rem" />

            <YAxis>
              <Subtitle4 color={ColorPalette["gray-300"]}>
                {intl.formatMessage({
                  id: "page.stake.dashboard.staking-button.label",
                })}
              </Subtitle4>
              <Gutter size="0.25rem" />
              <Subtitle2
                color={
                  theme.mode === "light"
                    ? ColorPalette["gray-700"]
                    : ColorPalette["gray-10"]
                }
              >
                {stakableBalance
                  ?.maxDecimals(6)
                  .inequalitySymbol(true)
                  .shrink(true)
                  .toString() || "-"}
              </Subtitle2>
            </YAxis>

            <div style={{ flex: 1 }} />

            <Button
              text={intl.formatMessage({
                id: "page.stake.dashboard.staking-button",
              })}
              size="medium"
              color="primary"
              onClick={() => {
                navigate(`/stake/validators?chainId=${chainId}`);
              }}
            />
          </XAxis>
        </Box>

        <Gutter size="1.25rem" />

        <Stack gutter="1.25rem">
          {validatorViewData.map(({ title, validators, key }) => {
            if (validators.length === 0) {
              return null;
            }

            return (
              <CollapsibleList
                key={key}
                title={<TokenTitleView title={title} />}
                lenAlwaysShown={4}
                items={validators.map((viewValidator) => (
                  <Box
                    key={
                      viewValidator.validatorAddress + viewValidator.subString
                    }
                    marginBottom="0.5rem"
                  >
                    <ValidatorItem
                      chainId={chainId}
                      viewValidator={viewValidator}
                      onClick={() => {
                        navigate(
                          `/stake/validator/${chainId}/${viewValidator.validatorAddress}`
                        );
                      }}
                    />
                  </Box>
                ))}
              />
            );
          })}
        </Stack>

        <Gutter size="1.25rem" />
      </Box>
    </HeaderLayout>
  );
});
