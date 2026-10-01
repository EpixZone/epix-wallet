import React from "react";
import { ComponentMeta } from "@storybook/react";
import { createIntl } from "react-intl";
import { DSColor, DSThemeProvider } from "@keplr-wallet/design-system";
import messages from "../../languages/en.json";
import {
  SwapQuoteRoute,
  SwapRouteSearch,
  SwapQuoteRefreshStatus,
} from "./swap-quote-route";
import { quoteRouteView } from "./quote-route";
import { OSMOSIS_SWAP_TOKENS } from "./tokens";
import { parseOsmosisAssetRegistry } from "./osmosis-asset-registry";
import type { TranslateProgress } from "./main-swap-view";

const intl = createIntl({ locale: "en", messages });
const t: TranslateProgress = (key, values) =>
  intl.formatMessage({ id: `page.epix-swap.${key}` }, values);

export default {
  title: "Components/Swap quote route",
  component: SwapQuoteRoute,
  decorators: [
    (Story) => (
      <DSThemeProvider defaultTheme="dark">
        <div
          style={{
            maxWidth: "22rem",
            margin: "1rem",
            padding: "1rem",
            borderRadius: "0.75rem",
            background: DSColor.background.surface.surface,
          }}
        >
          <Story />
        </div>
      </DSThemeProvider>
    ),
  ],
} as ComponentMeta<typeof SwapQuoteRoute>;

export const Searching = () => <SwapRouteSearch t={t} outputToken="USDC" />;

// Public registry fixture. Previews do not fetch or write extension storage.
const atom =
  "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";
const registry = parseOsmosisAssetRegistry(
  JSON.stringify({
    chainName: "osmosis",
    assets: [
      {
        coinMinimalDenom: atom,
        symbol: "ATOM",
        name: "Cosmos Hub",
        logoURIs: {
          svg: "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.svg",
        },
      },
    ],
  })
);

export const RegistryAsset = () => (
  <SwapQuoteRoute
    t={t}
    routes={
      quoteRouteView(
        [
          { poolId: "3352", tokenOutDenom: "uosmo" },
          { poolId: "1", tokenOutDenom: atom },
        ],
        registry
      ) ?? []
    }
  />
);

export const Direct = () => (
  <SwapQuoteRoute
    t={t}
    routes={quoteRouteView([{ poolId: "2143", tokenOutDenom: "uosmo" }]) ?? []}
  />
);

export const MultiplePools = () => (
  <SwapQuoteRoute
    t={t}
    routes={
      quoteRouteView([
        { poolId: "2143", tokenOutDenom: "uosmo" },
        {
          poolId: "678",
          tokenOutDenom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom,
        },
      ]) ?? []
    }
  />
);

export const Refreshing = () => (
  <React.Fragment>
    <SwapQuoteRefreshStatus t={t} refreshing stale={false} />
    <MultiplePools />
  </React.Fragment>
);

export const Bitcoin = () => (
  <SwapQuoteRoute
    t={t}
    routes={
      quoteRouteView([
        {
          poolId: "3351",
          tokenOutDenom:
            "factory/osmo1k6c8jln7ejuqwtqmay3yvzrg3kueaczl96pk067ldg8u835w0yhsw27twm/alloyed/allETH",
        },
        {
          poolId: "1980",
          tokenOutDenom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom,
        },
      ]) ?? []
    }
  />
);

export const LongRoute = () => (
  <SwapQuoteRoute
    t={t}
    routes={
      quoteRouteView(
        Array.from({ length: 8 }, (_, index) => ({
          poolId: String(index + 1),
          tokenOutDenom:
            index === 7
              ? "uosmo"
              : `ibc/${"0123456789ABCDEF".repeat(4)}${index}`,
        }))
      ) ?? []
    }
  />
);

export const AlloyedStablecoins = () => (
  <SwapQuoteRoute
    t={t}
    routes={
      quoteRouteView([
        {
          poolId: "3486",
          tokenOutDenom:
            "factory/osmo1em6xs47hd82806f5cxgyufguxrrc7l0aqx7nzzptjuqgswczk8csavdxek/alloyed/allUSDT",
        },
        {
          poolId: "3507",
          tokenOutDenom:
            "factory/osmo147h5x9pcj7lm0cttlaefx6sqq5vdfnmwfcqxkmjd7exqm9gc7grqhr75m0/alloyed/allUSDC",
        },
        {
          poolId: "3502",
          tokenOutDenom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom,
        },
      ]) ?? []
    }
  />
);
