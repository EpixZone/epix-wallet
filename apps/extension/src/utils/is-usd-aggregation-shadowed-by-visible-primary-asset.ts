import { ChainIdHelper } from "@keplr-wallet/cosmos";

import type { ChainStore } from "../stores/chain";

export function isUsdAggregationShadowedByVisiblePrimaryAsset(
  chainStore: ChainStore,
  disabledViewAssetTokenMap: ReadonlyMap<string, ReadonlySet<string>>,
  chainId: string,
  coinMinimalDenom: string
): boolean {
  const primaryAsset = chainStore.getUsdAggregationShadowPrimaryAsset(
    chainId,
    coinMinimalDenom
  );
  if (!primaryAsset) return false;

  const disabledPrimaryCoinSet = disabledViewAssetTokenMap.get(
    ChainIdHelper.parse(primaryAsset.chainId).identifier
  );
  return !disabledPrimaryCoinSet?.has(primaryAsset.coinMinimalDenom);
}
