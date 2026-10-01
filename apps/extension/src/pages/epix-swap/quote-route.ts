import { OSMOSIS_SWAP_TOKENS } from "./tokens";

// Display-only intermediate from the Osmosis asset registry (symbol ETH, display allETH):
// https://github.com/cosmos/chain-registry/blob/cc1ed04b31326bc79f3208e571fb71fa0fddb987/osmosis/assetlist.json
const OSMOSIS_ALLETH_DENOM =
  "factory/osmo1k6c8jln7ejuqwtqmay3yvzrg3kueaczl96pk067ldg8u835w0yhsw27twm/alloyed/allETH";

export type QuoteRouteHop = Readonly<{
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  tokenInDenom: string;
  tokenOutDenom: string;
}>;

function tokenLabel(denom: string): string {
  const currency = OSMOSIS_SWAP_TOKENS.find(
    (token) => token.coinMinimalDenom === denom
  );
  if (currency) return currency.coinDenom;
  if (denom === OSMOSIS_ALLETH_DENOM) return "ETH (allETH)";
  // An unknown intermediate remains a denomination, never a guessed symbol.
  return denom.length > 24 ? `${denom.slice(0, 12)}…${denom.slice(-8)}` : denom;
}

/** Convert the validated single-route pool sequence without truncating its path. */
export function quoteRouteView(
  routes?: ReadonlyArray<Readonly<{ poolId: string; tokenOutDenom: string }>>
): ReadonlyArray<QuoteRouteHop> | undefined {
  if (!routes?.length || routes.length > 8) return undefined;
  let tokenInDenom = OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom;
  return routes.map(({ poolId, tokenOutDenom }) => {
    const hop = {
      poolId,
      tokenIn: tokenLabel(tokenInDenom),
      tokenOut: tokenLabel(tokenOutDenom),
      tokenInDenom,
      tokenOutDenom,
    };
    tokenInDenom = tokenOutDenom;
    return hop;
  });
}
