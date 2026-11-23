import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoinPretty } from "@keplr-wallet/unit";
import { NobleUsdnCurrency } from "../../../config";
import { NOBLE_CHAIN_ID } from "../../../config.ui";
import { EarnOverviewPage } from "./index";

jest.mock("../../../public/assets/logo-256.png", () => "epix.png");
jest.mock("../../../analytics-amplitude", () => ({}));
jest.mock("../../../stores", () => ({ useStore: () => mockStore }));
jest.mock("../../../styles", () => ({ ColorPalette: {} }));
jest.mock("styled-components", () => ({ useTheme: () => ({ mode: "light" }) }));
jest.mock("react-router", () => ({ useNavigate: () => mockNavigate }));
jest.mock("react-intl", () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
  FormattedMessage: ({ id }: { id: string }) => id,
}));

function mockContainer({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
jest.mock("../../../layouts/header", () => ({ HeaderLayout: mockContainer }));
jest.mock("../../../components/box", () => ({ Box: mockContainer }));
jest.mock("../../../components/axis", () => ({ XAxis: mockContainer }));
jest.mock("../../../components/typography", () => ({
  H1: mockContainer,
  H4: mockContainer,
  Body3: mockContainer,
  Subtitle3: mockContainer,
}));
jest.mock("../../../components/icon", () => ({ ArrowLeftIcon: () => null }));
jest.mock("../../../components/divder", () => ({ Divider: () => null }));
jest.mock("../../../components/gutter", () => ({ Gutter: () => null }));
jest.mock("../../../components/image", () => ({ Image: () => null }));
jest.mock("../../../components/tooltip", () => ({ Tooltip: mockContainer }));
jest.mock("../components/overview-history-section", () => ({
  EarnOverviewHistorySection: () => null,
}));

interface ButtonAction {
  text: string;
  disabled?: boolean;
  onClick: () => void;
}
const mockActions = new Map<string, ButtonAction>();
jest.mock("../../../components/button", () => ({
  Button: (props: ButtonAction) => {
    mockActions.set(props.text, props);
    return null;
  },
}));

const mockNavigate = jest.fn();
const account = { bech32Address: "test-account" };
const getBalance = jest.fn();
const getYield = jest.fn();
const mockStore = {
  chainStore: {
    getModularChain: jest.fn(() => ({ findCurrency: () => undefined })),
  },
  accountStore: { getAccount: jest.fn(() => account) },
  queriesStore: {
    get: () => ({
      queryBalances: { getQueryBech32Address: () => ({ getBalance }) },
      noble: { queryYield: { getQueryBech32Address: getYield } },
    }),
    simpleQuery: { queryGet: () => ({}) },
  },
  priceStore: { calculatePrice: jest.fn() },
  uiConfigStore: { fiatCurrency: { currency: "eur" } },
};
const claim = "page.earn.overview.claim-section.claim-button";
const withdraw = "button.withdraw";

function renderOverview() {
  mockActions.clear();
  const html = renderToStaticMarkup(<EarnOverviewPage />);
  expect([...mockActions.keys()].sort()).toEqual([claim, withdraw].sort());
  return html;
}

it("keeps accrued Noble claims accessible after the last USDN is transferred", () => {
  getYield.mockReturnValue({ response: {}, claimableAmount: "1000000" });
  getBalance.mockReturnValue({
    response: {},
    balance: new CoinPretty(NobleUsdnCurrency, 0),
  });
  renderOverview();
  expect(mockStore.accountStore.getAccount).toHaveBeenCalledWith(
    NOBLE_CHAIN_ID
  );
  expect(getYield).toHaveBeenCalledWith(account.bech32Address);
  expect(mockActions.get(claim)?.disabled).toBe(false);
  expect(mockActions.get(withdraw)?.disabled).toBe(true);
});

it("opens the USDN withdrawal and values the balance in the selected fiat", () => {
  const balance = new CoinPretty(NobleUsdnCurrency, "2000000");
  getBalance.mockReturnValue({ response: {}, balance });
  getYield.mockReturnValue({ response: {}, claimableAmount: "0" });
  renderOverview();
  expect(mockStore.priceStore.calculatePrice).toHaveBeenCalledWith(
    balance,
    "eur"
  );
  expect(mockActions.get(claim)?.disabled).toBe(true);
  expect(mockActions.get(withdraw)?.disabled).toBe(false);
  mockActions.get(withdraw)?.onClick();
  expect(mockNavigate).toHaveBeenCalledWith("/earn/withdraw/amount");
});

it("shows unavailable amounts and disables actions when the chain queries fail", () => {
  getBalance.mockReturnValue({ error: new Error("offline") });
  getYield.mockReturnValue({ error: new Error("offline") });
  const html = renderOverview();
  expect(html.match(/page\.earn\.unavailable/g)).toHaveLength(2);
  expect(mockActions.get(claim)?.disabled).toBe(true);
  expect(mockActions.get(withdraw)?.disabled).toBe(true);
});
