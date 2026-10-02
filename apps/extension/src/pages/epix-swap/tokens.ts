import { Currency } from "@keplr-wallet/types";
import { OSMOSIS_SWAP_TOKENS } from "../../stores/chain/swap-currencies";

export { OSMOSIS_SWAP_TOKENS } from "../../stores/chain/swap-currencies";

export const OSMOSIS_SWAP_OUTPUT_OPTIONS = [
  { denom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom, label: "BTC (allBTC)" },
  { denom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom, label: "USDT (allUSDT)" },
  { denom: OSMOSIS_SWAP_TOKENS[4].coinMinimalDenom, label: "USDC (allUSDC)" },
  { denom: OSMOSIS_SWAP_TOKENS[3].coinMinimalDenom, label: "OSMO" },
] as const;

// Fee support is independent of the assets offered as swap outputs.
export const OSMOSIS_SWAP_FEE_OPTIONS = [
  { denom: OSMOSIS_SWAP_TOKENS[3].coinMinimalDenom, label: "OSMO" },
  { denom: OSMOSIS_SWAP_TOKENS[5].coinMinimalDenom, label: "USDC (native)" },
  { denom: OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom, label: "BTC (allBTC)" },
] as const;

export const EPIX_CHAIN_ID = "epix_1916-1";
export const OSMOSIS_CHAIN_ID = "osmosis-1";
export const EPIX_CURRENCY: Currency = {
  coinDenom: "EPIX",
  coinMinimalDenom: "aepix",
  coinDecimals: 18,
  coinGeckoId: "epix",
};
