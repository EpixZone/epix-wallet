import { useMemo } from "react";
import { useStore } from "../../../stores";
import { Dec } from "@keplr-wallet/unit";
import { ViewToken } from "../../main";
import { supportsNativeStaking } from "../utils";

const zeroDec = new Dec(0);

export const useStakableTokens = () => {
  const { hugeQueriesStore, priceStore } = useStore();

  const stakableTokens = useMemo(() => {
    return hugeQueriesStore.stakables
      .filter((token) => {
        if (!token.token.toDec().gt(zeroDec)) {
          return false;
        }
        if (token.chainInfo.type === "starknet") {
          if (token.chainInfo.chainId === "starknet:SN_SEPOLIA") {
            return false;
          }
          return true;
        }
        if (token.chainInfo.type === "bitcoin") {
          return false;
        }
        if (token.chainInfo.isTestnet) {
          return false;
        }
        return supportsNativeStaking(token.chainInfo);
      })
      .sort((a, b) => {
        const aPrice = priceStore.calculatePrice(a.token)?.toDec() ?? zeroDec;
        const bPrice = priceStore.calculatePrice(b.token)?.toDec() ?? zeroDec;

        if (aPrice.equals(bPrice)) {
          return 0;
        }
        return aPrice.gt(bPrice) ? -1 : 1;
      });
  }, [hugeQueriesStore.stakables, priceStore]);

  // Only the chains without a native staking flow keep an external url
  // (e.g. starknet). Cosmos chains stake natively inside the wallet.
  const getStakingUrl = (viewToken: ViewToken): string | undefined => {
    if (viewToken.chainInfo.type === "starknet") {
      return "https://voyager.online/staking";
    }
    return undefined;
  };

  return {
    stakableTokens,
    getStakingUrl,
  };
};
