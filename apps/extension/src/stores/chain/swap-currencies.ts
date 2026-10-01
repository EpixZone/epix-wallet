import {
  AppCurrency,
  ChainInfo,
  Currency,
  ModularChainInfo,
} from "@keplr-wallet/types";
import { EPIX_OSMOSIS_DENOM } from "../price/epix";

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

function mergeSwapCurrencies(currencies: AppCurrency[]): AppCurrency[] {
  const merged = new Map<string, AppCurrency>();
  for (const currency of currencies) {
    if (!merged.has(currency.coinMinimalDenom)) {
      merged.set(currency.coinMinimalDenom, currency);
    }
  }
  for (const currency of OSMOSIS_SWAP_TOKENS) {
    merged.set(currency.coinMinimalDenom, {
      ...merged.get(currency.coinMinimalDenom),
      ...currency,
    });
  }
  return Array.from(merged.values());
}

// Apply to every metadata load so received swap assets are visible on Home
// even after a restart or a registry response that omits these currencies.
export function withOsmosisSwapCurrencies<
  T extends ChainInfo | ModularChainInfo
>(chain: T): T {
  if (chain.chainId !== "osmosis-1" || chain.isTestnet) return chain;
  const modular = chain as ModularChainInfo;
  if (modular.isV2) {
    if (modular.type !== "cosmos" || modular.cosmos.isTestnet) return chain;
    return {
      ...chain,
      cosmos: {
        ...modular.cosmos,
        currencies: mergeSwapCurrencies(modular.cosmos.currencies),
      },
    };
  }
  return {
    ...chain,
    currencies: mergeSwapCurrencies((chain as ChainInfo).currencies),
  };
}
