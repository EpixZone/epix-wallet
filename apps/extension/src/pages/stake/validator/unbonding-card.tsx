import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";
import { useTheme } from "styled-components";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { XAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { Stack } from "../../../components/stack";
import { Body2, Body3, Subtitle3 } from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { formatRelativeTimeString } from "../utils";

const FALLBACK_UNBONDING_TIME_SEC = 3600 * 24 * 21;

export const UnbondingCard: FunctionComponent<{
  chainId: string;
  validatorAddress: string;
}> = observer(({ chainId, validatorAddress }) => {
  const { accountStore, queriesStore } = useStore();
  const intl = useIntl();
  const theme = useTheme();

  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);

  const unbonding = queries.cosmos.queryUnbondingDelegations
    .getQueryBech32Address(account.bech32Address)
    .unbondingBalances.find(
      (unbonding) => unbonding.validatorAddress === validatorAddress
    );

  if (!unbonding) {
    return null;
  }

  return (
    <Box>
      <Box paddingX="0.375rem" paddingY="0.25rem">
        <Subtitle3 color={ColorPalette["gray-300"]}>
          <FormattedMessage id="page.stake.validator-detail.unbonding-card.label" />
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
        <Stack gutter="1.5rem">
          {unbonding.entries.map((entry, i) => {
            const remainingText = formatRelativeTimeString(
              intl,
              entry.completionTime
            );
            const progress = (() => {
              const currentTime = new Date().getTime();
              const endTime = new Date(entry.completionTime).getTime();
              const remainingTime = Math.floor((endTime - currentTime) / 1000);
              const unbondingTime = queries.cosmos.queryStakingParams.response
                ? queries.cosmos.queryStakingParams.unbondingTimeSec
                : FALLBACK_UNBONDING_TIME_SEC;

              return Math.max(
                0,
                Math.min(100 - (remainingTime / unbondingTime) * 100, 100)
              );
            })();

            return (
              <Box key={i.toString()}>
                <XAxis alignY="center">
                  <Body2
                    color={
                      theme.mode === "light"
                        ? ColorPalette["gray-700"]
                        : ColorPalette["gray-10"]
                    }
                  >
                    {entry.balance
                      .shrink(true)
                      .trim(true)
                      .maxDecimals(6)
                      .inequalitySymbol(true)
                      .toString()}
                  </Body2>
                  <div style={{ flex: 1 }} />
                  <Body3 color={ColorPalette["gray-300"]}>
                    {remainingText}
                  </Body3>
                </XAxis>
                <Gutter size="0.5rem" />
                <ProgressBar progress={progress} />
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
});

const ProgressBar: FunctionComponent<{
  // 0 - 100
  progress: number;
}> = ({ progress }) => {
  const theme = useTheme();

  return (
    <Box
      height="0.5rem"
      borderRadius="2rem"
      backgroundColor={
        theme.mode === "light"
          ? ColorPalette["gray-100"]
          : ColorPalette["gray-500"]
      }
    >
      <Box
        height="0.5rem"
        borderRadius="2rem"
        backgroundColor={ColorPalette["purple-400"]}
        width={`${progress}%`}
      />
    </Box>
  );
};
