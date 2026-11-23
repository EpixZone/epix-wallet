import { observer } from "mobx-react-lite";
import React, { FunctionComponent } from "react";
import { HeaderLayout } from "../../../layouts/header";
import { useIntl } from "react-intl";
import { Box } from "../../../components/box";
import { ArrowLeftIcon } from "../../../components/icon";
import { useNavigate } from "react-router";
import { useStore } from "../../../stores";
import { Gutter } from "../../../components/gutter";
import { Divider } from "../../../components/divder";
import { EarnOverviewClaimSection } from "../components/overview-claim-section";
import { EarnOverviewBalanceSection } from "../components/overview-balance-section";
import { NOBLE_CHAIN_ID } from "../../../config.ui";
import { EarnOverviewHistorySection } from "../components/overview-history-section";
import { NobleUsdnCurrency } from "../../../config";

export const EarnOverviewPage: FunctionComponent = observer(() => {
  const intl = useIntl();

  const { chainStore, accountStore } = useStore();
  const chainId = NOBLE_CHAIN_ID;
  const modularChainInfo = chainStore.getModularChain(chainId);
  const account = accountStore.getAccount(chainId);
  const rewardCurrency =
    modularChainInfo.findCurrency("uusdn") ?? NobleUsdnCurrency;

  return (
    <HeaderLayout
      title={intl.formatMessage({ id: "page.earn.overview.title" })}
      left={<BackToHomeButton />}
    >
      <Gutter size="1.25rem" />

      <EarnOverviewClaimSection chainId={chainId} currency={rewardCurrency} />

      <Divider direction="horizontal" spacing="1.625rem" />

      <EarnOverviewBalanceSection
        chainId={chainId}
        rewardCurrency={rewardCurrency}
        bech32Address={account.bech32Address}
      />

      <Gutter size="1.5rem" />
      {process.env["KEPLR_EXT_TX_HISTORY_BASE_URL"] && (
        <React.Fragment>
          <Divider direction="horizontal" />
          <EarnOverviewHistorySection chainInfo={modularChainInfo} />
        </React.Fragment>
      )}
    </HeaderLayout>
  );
});

const BackToHomeButton: FunctionComponent = () => {
  const navigate = useNavigate();

  return (
    <Box paddingLeft="1rem" cursor="pointer" onClick={() => navigate("/")}>
      <ArrowLeftIcon />
    </Box>
  );
};
