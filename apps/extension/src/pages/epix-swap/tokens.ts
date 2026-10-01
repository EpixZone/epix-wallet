import { Currency } from "@keplr-wallet/types";
import { EPIX_OSMOSIS_DENOM } from "../../stores/price/epix";

export const EPIX_CHAIN_ID = "epix_1916-1";
export const OSMOSIS_CHAIN_ID = "osmosis-1";
export const EPIX_CURRENCY: Currency = {
  coinDenom: "EPIX",
  coinMinimalDenom: "aepix",
  coinDecimals: 18,
  coinGeckoId: "epix",
};

export const OSMOSIS_SWAP_TOKENS: readonly Currency[] = [
  {
    coinDenom: "EPIX",
    coinMinimalDenom: EPIX_OSMOSIS_DENOM,
    coinDecimals: 18,
    coinGeckoId: "epix",
  },
  {
    coinDenom: "USDC",
    coinMinimalDenom:
      "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4",
    coinDecimals: 6,
    coinGeckoId: "usd-coin",
  },
  {
    coinDenom: "BTC",
    coinMinimalDenom:
      "factory/osmo1z6r6qdknhgsc0zeracktgpcxf43j6sekq07nw8sxduc9lg0qjjlqfu25e3/alloyed/allBTC",
    coinDecimals: 8,
    coinGeckoId: "bitcoin",
  },
  {
    coinDenom: "OSMO",
    coinMinimalDenom: "uosmo",
    coinDecimals: 6,
    coinGeckoId: "osmosis",
  },
];
