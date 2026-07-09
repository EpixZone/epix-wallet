import React, { FunctionComponent, useMemo } from "react";
import { observer } from "mobx-react-lite";
import styled, { useTheme } from "styled-components";
import { CoinPretty, Dec, RatePretty } from "@keplr-wallet/unit";
import { Staking } from "@keplr-wallet/stores";
import { useStore } from "../../../../stores";
import { Box } from "../../../../components/box";
import { XAxis, YAxis } from "../../../../components/axis";
import { Gutter } from "../../../../components/gutter";
import { Body3, Subtitle2, Subtitle3 } from "../../../../components/typography";
import { ColorPalette } from "../../../../styles";
import { ArrowRightIcon, InformationIcon } from "../../../../components/icon";
import { ValidatorImage } from "../validator-image";
import { COMMON_HOVER_OPACITY } from "../../../../styles/constant";

export interface ViewValidator {
  coin?: CoinPretty;
  name?: string;
  subString?: string;
  isDelegation?: boolean;
  validatorAddress: string;
}

export type ValidatorSortOption = "voting-power" | "commission";

const ItemContainer = styled(Box)`
  cursor: pointer;

  &:hover {
    opacity: ${COMMON_HOVER_OPACITY};
  }
`;

const useValidatorItemBackgroundColor = () => {
  const theme = useTheme();
  return theme.mode === "light"
    ? ColorPalette["white"]
    : ColorPalette["gray-650"];
};

export const ValidatorItem: FunctionComponent<{
  chainId: string;
  viewValidator: ViewValidator;
  onClick: () => void;
}> = observer(({ chainId, viewValidator, onClick }) => {
  const { queriesStore } = useStore();
  const theme = useTheme();

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

  const isJailed = !!unbondedValidators.validators
    .concat(unbondingValidators.validators)
    .find((val) => val.operator_address === viewValidator.validatorAddress)
    ?.jailed;

  const thumbnail =
    bondedValidators.getValidatorThumbnail(viewValidator.validatorAddress) ||
    unbondingValidators.getValidatorThumbnail(viewValidator.validatorAddress) ||
    unbondedValidators.getValidatorThumbnail(viewValidator.validatorAddress);

  const backgroundColor = useValidatorItemBackgroundColor();

  return (
    <ItemContainer
      backgroundColor={backgroundColor}
      borderRadius="0.375rem"
      padding="1rem"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        boxShadow:
          theme.mode === "light" ? "0 1px 4px 0 rgba(43,39,55,0.1)" : undefined,
      }}
    >
      <XAxis alignY="center">
        <ValidatorImage
          imageUrl={thumbnail}
          name={viewValidator.name}
          isDelegation={viewValidator.isDelegation}
        />
        <Gutter size="0.75rem" />

        <XAxis alignY="center">
          {isJailed ? (
            <React.Fragment>
              <InformationIcon
                width="1rem"
                height="1rem"
                color={ColorPalette["red-400"]}
              />
              <Gutter size="0.25rem" />
            </React.Fragment>
          ) : null}
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
              maxWidth: "9rem",
            }}
          >
            {viewValidator.name}
          </Subtitle2>
        </XAxis>

        <div style={{ flex: 1 }} />

        <YAxis alignX="right">
          {viewValidator.coin ? (
            <Subtitle3
              color={
                theme.mode === "light"
                  ? ColorPalette["gray-700"]
                  : ColorPalette["gray-10"]
              }
            >
              {viewValidator.coin
                .maxDecimals(6)
                .trim(true)
                .inequalitySymbol(true)
                .shrink(true)
                .toString()}
            </Subtitle3>
          ) : null}
          {viewValidator.subString ? (
            <React.Fragment>
              <Gutter size="0.25rem" />
              <Body3 color={ColorPalette["gray-300"]}>
                {viewValidator.subString}
              </Body3>
            </React.Fragment>
          ) : null}
        </YAxis>

        <Gutter size="0.25rem" />
        <ArrowRightIcon
          width="1.5rem"
          height="1.5rem"
          color={ColorPalette["gray-300"]}
        />
      </XAxis>
    </ItemContainer>
  );
});

export const ValidatorListItem: FunctionComponent<{
  chainId: string;
  validator: Staking.Validator;
  sortOption: ValidatorSortOption;
  bondedToken?: CoinPretty;
  isDelegation?: boolean;
  onClick: () => void;
}> = observer(
  ({ chainId, validator, sortOption, bondedToken, isDelegation, onClick }) => {
    const { chainStore, queriesStore } = useStore();
    const theme = useTheme();

    const queries = queriesStore.get(chainId);
    const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Bonded
    );
    const thumbnail = bondedValidators.getValidatorThumbnail(
      validator.operator_address
    );

    const modularChainInfo = chainStore.getModularChain(chainId);
    const u = modularChainInfo.unwrapped;
    const stakeCurrency =
      u.type === "cosmos" || u.type === "ethermint"
        ? u.cosmos.stakeCurrency ?? u.cosmos.feeCurrencies[0]
        : undefined;

    const coin = useMemo(() => {
      if (!stakeCurrency) {
        return undefined;
      }
      return new CoinPretty(stakeCurrency, new Dec(validator.delegator_shares));
    }, [stakeCurrency, validator.delegator_shares]);

    const subString = useMemo(() => {
      if (sortOption === "voting-power") {
        if (!coin || bondedToken?.toCoin().amount === "0") {
          return "0%";
        }
        return new RatePretty(
          coin.toDec().quo(bondedToken?.toDec() || new Dec(1))
        )
          .maxDecimals(2)
          .toString();
      }

      return new RatePretty(validator.commission.commission_rates.rate)
        .maxDecimals(2)
        .toString();
    }, [sortOption, coin, bondedToken, validator.commission]);

    const isWarning =
      sortOption === "commission" &&
      Number(validator.commission.commission_rates.rate) >= 0.2;

    const backgroundColor = useValidatorItemBackgroundColor();

    return (
      <ItemContainer
        backgroundColor={backgroundColor}
        borderRadius="0.375rem"
        padding="1rem"
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        style={{
          boxShadow:
            theme.mode === "light"
              ? "0 1px 4px 0 rgba(43,39,55,0.1)"
              : undefined,
        }}
      >
        <XAxis alignY="center">
          <ValidatorImage
            imageUrl={thumbnail}
            name={validator.description.moniker}
            isDelegation={isDelegation}
          />
          <Gutter size="0.75rem" />

          <XAxis alignY="center">
            {isWarning ? (
              <React.Fragment>
                <InformationIcon
                  width="1rem"
                  height="1rem"
                  color={ColorPalette["yellow-400"]}
                />
                <Gutter size="0.25rem" />
              </React.Fragment>
            ) : null}
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
                maxWidth: "9rem",
              }}
            >
              {validator.description.moniker || validator.operator_address}
            </Subtitle2>
          </XAxis>

          <div style={{ flex: 1 }} />

          <YAxis alignX="right">
            {sortOption === "voting-power" && coin ? (
              <React.Fragment>
                <Body3
                  color={
                    theme.mode === "light"
                      ? ColorPalette["gray-500"]
                      : ColorPalette["gray-100"]
                  }
                >
                  {coin.maxDecimals(6).trim(true).shrink(true).toString()}
                </Body3>
                <Gutter size="0.25rem" />
              </React.Fragment>
            ) : null}
            <Body3
              color={
                isWarning
                  ? ColorPalette["yellow-400"]
                  : ColorPalette["gray-300"]
              }
            >
              {subString}
            </Body3>
          </YAxis>

          <Gutter size="0.25rem" />
          <ArrowRightIcon
            width="1.5rem"
            height="1.5rem"
            color={ColorPalette["gray-300"]}
          />
        </XAxis>
      </ItemContainer>
    );
  }
);
