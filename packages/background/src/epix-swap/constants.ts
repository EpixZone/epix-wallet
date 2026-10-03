export const ROUTE = "epix-swap";
export const EPIX_CHAIN_ID = "epix_1916-1";
export const OSMOSIS_CHAIN_ID = "osmosis-1";

export const OSMOSIS_USDC_DENOM =
  "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";
export const OSMOSIS_ALL_BTC_DENOM =
  "factory/osmo1z6r6qdknhgsc0zeracktgpcxf43j6sekq07nw8sxduc9lg0qjjlqfu25e3/alloyed/allBTC";
export const OSMOSIS_ALL_USDT_DENOM =
  "factory/osmo1em6xs47hd82806f5cxgyufguxrrc7l0aqx7nzzptjuqgswczk8csavdxek/alloyed/allUSDT";
export const OSMOSIS_ALL_USDC_DENOM =
  "factory/osmo147h5x9pcj7lm0cttlaefx6sqq5vdfnmwfcqxkmjd7exqm9gc7grqhr75m0/alloyed/allUSDC";

// Authorization is fixed here. Display registry metadata cannot add assets.
export const SUPPORTED_OUTPUT_DENOMS = [
  OSMOSIS_ALL_BTC_DENOM,
  OSMOSIS_ALL_USDT_DENOM,
  OSMOSIS_ALL_USDC_DENOM,
  "uosmo",
] as const;

// Fee selection is independent of swap outputs and still requires the live
// chain fee-token allowlist. Adding an output never grants fee authorization.
export const SUPPORTED_FEE_DENOMS = [
  OSMOSIS_USDC_DENOM,
  OSMOSIS_ALL_BTC_DENOM,
  "uosmo",
] as const;
