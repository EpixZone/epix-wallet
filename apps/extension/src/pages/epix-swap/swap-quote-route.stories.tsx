import React from "react";
import { ComponentMeta } from "@storybook/react";
import { createIntl } from "react-intl";
import { DSColor } from "@keplr-wallet/design-system";
import messages from "../../languages/en.json";
import { SwapQuoteRoute, SwapRouteSearch } from "./swap-quote-route";
import { quoteRouteView } from "./quote-route";
import { OSMOSIS_SWAP_TOKENS } from "./tokens";
import type { TranslateProgress } from "./main-swap-view";

const intl = createIntl({ locale: "en", messages });
const t: TranslateProgress = (key, values) =>
  intl.formatMessage({ id: `page.epix-swap.${key}` }, values);

export default {
  title: "Components/Swap quote route",
  component: SwapQuoteRoute,
  decorators: [
    (Story) => (
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
    ),
  ],
} as ComponentMeta<typeof SwapQuoteRoute>;

export const Searching = () => <SwapRouteSearch t={t} outputToken="USDC" />;

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
