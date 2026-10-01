import { OSMOSIS_SWAP_TOKENS } from "./tokens";
import type { OsmosisAssetMetadata } from "./osmosis-asset-registry";

// Display-only intermediates from the Osmosis asset registry. Match the full
// denomination, never a token factory issuer's suffix or an unverified symbol.
// https://github.com/cosmos/chain-registry/blob/cc1ed04b31326bc79f3208e571fb71fa0fddb987/osmosis/assetlist.json
export const OSMOSIS_ROUTE_INTERMEDIATES = {
  allETH: {
    denom:
      "factory/osmo1k6c8jln7ejuqwtqmay3yvzrg3kueaczl96pk067ldg8u835w0yhsw27twm/alloyed/allETH",
    symbol: "ETH",
    label: "ETH (allETH)",
  },
  allUSDT: {
    denom:
      "factory/osmo1em6xs47hd82806f5cxgyufguxrrc7l0aqx7nzzptjuqgswczk8csavdxek/alloyed/allUSDT",
    symbol: "USDT",
    label: "USDT (allUSDT)",
  },
  allUSDC: {
    denom:
      "factory/osmo147h5x9pcj7lm0cttlaefx6sqq5vdfnmwfcqxkmjd7exqm9gc7grqhr75m0/alloyed/allUSDC",
    symbol: "USDC",
    label: "USDC (allUSDC)",
  },
} as const;

export type QuoteRouteHop = Readonly<{
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  tokenInDenom: string;
  tokenOutDenom: string;
  tokenInMetadata?: OsmosisAssetMetadata;
  tokenOutMetadata?: OsmosisAssetMetadata;
}>;

function tokenLabel(denom: string, metadata?: OsmosisAssetMetadata): string {
  const currency = OSMOSIS_SWAP_TOKENS.find(
    (token) => token.coinMinimalDenom === denom
  );
  if (currency) return currency.coinDenom;
  const intermediate = Object.values(OSMOSIS_ROUTE_INTERMEDIATES).find(
    (token) => token.denom === denom
  );
  if (intermediate) return intermediate.label;
  if (metadata) return metadata.symbol;
  // An unknown intermediate remains a denomination, never a guessed symbol.
  return denom.length > 24 ? `${denom.slice(0, 12)}…${denom.slice(-8)}` : denom;
}

/** Convert the validated single-route pool sequence without truncating its path. */
export function quoteRouteView(
  routes?: ReadonlyArray<Readonly<{ poolId: string; tokenOutDenom: string }>>,
  registry?: ReadonlyMap<string, OsmosisAssetMetadata>
): ReadonlyArray<QuoteRouteHop> | undefined {
  if (!routes?.length || routes.length > 8) return undefined;
  let tokenInDenom = OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom;
  return routes.map(({ poolId, tokenOutDenom }) => {
    const tokenInMetadata = registry?.get(tokenInDenom);
    const tokenOutMetadata = registry?.get(tokenOutDenom);
    const hop = {
      poolId,
      tokenIn: tokenLabel(tokenInDenom, tokenInMetadata),
      tokenOut: tokenLabel(tokenOutDenom, tokenOutMetadata),
      tokenInDenom,
      tokenOutDenom,
      ...(tokenInMetadata ? { tokenInMetadata } : {}),
      ...(tokenOutMetadata ? { tokenOutMetadata } : {}),
    };
    tokenInDenom = tokenOutDenom;
    return hop;
  });
}
