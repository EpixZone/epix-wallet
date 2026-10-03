import { ChainIdHelper } from "@keplr-wallet/cosmos";
import {
  ChainInfo,
  CosmosChainInfo,
  Currency,
  ModularChainInfo,
} from "@keplr-wallet/types";
import { EPIX_PRICE_ID } from "./epix";

function nativeCurrency<T extends Currency>(currency: T): T {
  return currency.coinMinimalDenom === "aepix" && currency.coinDecimals === 18
    ? { ...currency, coinGeckoId: EPIX_PRICE_ID }
    : currency;
}

function cosmosPrices<T extends CosmosChainInfo>(chain: T): T {
  if (chain.isTestnet) return chain;
  return {
    ...chain,
    currencies: chain.currencies.map(nativeCurrency),
    feeCurrencies: chain.feeCurrencies.map(nativeCurrency),
    stakeCurrency: chain.stakeCurrency
      ? nativeCurrency(chain.stakeCurrency)
      : undefined,
  };
}

// Persisted/community registry metadata can predate the EPIX CoinGecko listing.
// Restore only the verified native asset after every background metadata merge.
export function withEpixPriceMetadata<T extends ChainInfo | ModularChainInfo>(
  chain: T
): T {
  if (
    chain.isTestnet ||
    ChainIdHelper.parse(chain.chainId).identifier !== "epix_1916"
  )
    return chain;
  if ("currencies" in chain) return cosmosPrices(chain) as T;
  if (chain.type === "cosmos" || chain.type === "ethermint") {
    return {
      ...chain,
      cosmos: cosmosPrices(chain.cosmos),
      ...(chain.type === "ethermint"
        ? {
            evm: {
              ...chain.evm,
              nativeCurrency: nativeCurrency(chain.evm.nativeCurrency),
            },
          }
        : {}),
    };
  }
  return chain;
}
