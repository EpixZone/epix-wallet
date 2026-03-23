import { useMemo } from "react";
import { useStore } from "../../../stores";
import { useKcrStakingUrls } from "../../../hooks/use-kcr-staking-urls";
import { Dec } from "@keplr-wallet/unit";
import { ViewToken } from "../../main";

const zeroDec = new Dec(0);

export const useStakableTokens = () => {
  const { hugeQueriesStore, priceStore } = useStore();
  const { getKcrStakingUrl, hasKcrStakingUrl } = useKcrStakingUrls();

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
        const hasNativeUrl = (() => {
          if (!token.chainInfo.embedded.isBuiltInChain) return false;
          const u = token.chainInfo.unwrapped;
          if (u.type === "cosmos" || u.type === "ethermint") {
            return !!u.cosmos.walletUrlForStaking;
          }
          return false;
        })();
        return hasNativeUrl || hasKcrStakingUrl(token.chainInfo.chainId);
      })
      .sort((a, b) => {
        const aPrice = priceStore.calculatePrice(a.token)?.toDec() ?? zeroDec;
        const bPrice = priceStore.calculatePrice(b.token)?.toDec() ?? zeroDec;

        if (aPrice.equals(bPrice)) {
          return 0;
        }
        return aPrice.gt(bPrice) ? -1 : 1;
      });
  }, [hugeQueriesStore.stakables, priceStore, hasKcrStakingUrl]);

  const getStakingUrl = (viewToken: ViewToken): string | undefined => {
    if (viewToken.chainInfo.type === "starknet") {
      return "https://voyager.online/staking";
    }
    const u = viewToken.chainInfo.unwrapped;
    const walletUrlForStaking =
      u.type === "cosmos" || u.type === "ethermint"
        ? u.cosmos.walletUrlForStaking
        : undefined;
    return walletUrlForStaking || getKcrStakingUrl(viewToken.chainInfo.chainId);
  };

  return {
    stakableTokens,
    getStakingUrl,
  };
};
