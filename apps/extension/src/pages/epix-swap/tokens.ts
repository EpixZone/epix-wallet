import { Currency } from "@keplr-wallet/types";

export { OSMOSIS_SWAP_TOKENS } from "../../stores/chain/swap-currencies";

export const EPIX_CHAIN_ID = "epix_1916-1";
export const OSMOSIS_CHAIN_ID = "osmosis-1";
export const EPIX_CURRENCY: Currency = {
  coinDenom: "EPIX",
  coinMinimalDenom: "aepix",
  coinDecimals: 18,
  coinGeckoId: "epix",
};
