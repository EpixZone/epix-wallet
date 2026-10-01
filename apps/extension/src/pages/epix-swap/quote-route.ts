import { OSMOSIS_SWAP_TOKENS } from "./tokens";

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
