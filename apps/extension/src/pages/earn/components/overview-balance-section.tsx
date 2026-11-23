import { Currency } from "@keplr-wallet/types";
import React from "react";
import { FunctionComponent } from "react";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { XAxis } from "../../../components/axis";
import { Box } from "../../../components/box";
import { Button } from "../../../components/button";
import { Gutter } from "../../../components/gutter";
import { Image } from "../../../components/image";
import { Subtitle3, H1, Body3 } from "../../../components/typography";
import { useStore } from "../../../stores";
import { ColorPalette } from "../../../styles";
import { observer } from "mobx-react-lite";
import { useTheme } from "styled-components";

export const EarnOverviewBalanceSection: FunctionComponent<{
  chainId: string;
  rewardCurrency: Currency;
  bech32Address: string;
}> = observer(({ chainId, rewardCurrency, bech32Address }) => {
  const theme = useTheme();
  const isLightMode = theme.mode === "light";

  const intl = useIntl();

  const { queriesStore, priceStore, uiConfigStore } = useStore();
  const balanceRes = queriesStore
    .get(chainId)
    .queryBalances.getQueryBech32Address(bech32Address);

  const balanceQuery = balanceRes.getBalance(rewardCurrency);
  const balance =
    balanceQuery?.response && !balanceQuery.error
      ? balanceQuery.balance
      : undefined;
  const price =
    balance &&
    priceStore.calculatePrice(balance, uiConfigStore.fiatCurrency.currency);
  const unavailable = intl.formatMessage({ id: "page.earn.unavailable" });

  const navigate = useNavigate();

  return (
    <Box paddingX="1.25rem">
      <XAxis alignY="center" gap="0.25rem">
        <Image
          src={rewardCurrency.coinImageUrl}
          width="20px"
          height="20px"
          alt={rewardCurrency.coinDenom}
        />

        <Subtitle3
          color={
            isLightMode ? ColorPalette["gray-400"] : ColorPalette["gray-200"]
          }
        >
          {rewardCurrency.coinDenom}
        </Subtitle3>
      </XAxis>
      <Gutter size="0.75rem" />

      <H1 color={isLightMode ? ColorPalette["gray-700"] : ColorPalette.white}>
        {balance?.hideDenom(true).shrink(true).toString() ?? unavailable}
      </H1>
      <Gutter size="0.5rem" />

      {price?.isReady && (
        <Body3 color={ColorPalette["gray-300"]}>{price.toString()}</Body3>
      )}
      <Gutter size="1.25rem" />

      <XAxis gap="0.75rem">
        <Button
          text={intl.formatMessage({ id: "button.withdraw" })}
          color="secondary"
          size="medium"
          disabled={!balance || balance.toDec().isZero()}
          style={{ width: "100%" }}
          onClick={() => navigate("/earn/withdraw/amount")}
        />
      </XAxis>
    </Box>
  );
});
