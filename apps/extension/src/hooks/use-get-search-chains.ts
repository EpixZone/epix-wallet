import { useEffect, useState, useMemo } from "react";
import { useStore } from "../stores";
import { ChainInfo } from "@keplr-wallet/types";
import { autorun } from "mobx";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { isChainSupportedByKeyType } from "../utils/is-chain-supported-by-key-type";

type SearchOption = "all" | "cosmos" | "evm";
type FilterOption = "all" | "chain" | "token" | "chainNameAndToken";

interface SearchedChainInfo {
  chainId: string;
  chainName: string;
  chainSymbolImageUrl?: string;
  suggestChainInfo?: ChainInfo;
}

interface UseGetSearchChainsBaseParams {
  search: string;
  searchOption?: SearchOption;
  filterOption?: FilterOption;
  minSearchLength?: number;
}

interface WithInitialChainInfos {
  initialChainInfos: SearchedChainInfo[];
  clearResultsOnEmptyQuery?: never;
}

interface WithClearResultsOnEmptyQuery {
  clearResultsOnEmptyQuery: boolean;
  initialChainInfos?: never;
}

type GetSearchChainsParams =
  | (UseGetSearchChainsBaseParams & WithInitialChainInfos)
  | (UseGetSearchChainsBaseParams & WithClearResultsOnEmptyQuery)
  | (UseGetSearchChainsBaseParams & {
      initialChainInfos?: never;
      clearResultsOnEmptyQuery?: never;
    });

/**
 * Returns the searched chain infos and the normalized search term.
 * @returns {Object} { trimSearch: string, searchedChainInfos: SearchedChainInfo[] }
 * @property {string} trimSearch The lowercase trimmed search string.
 * @property {SearchedChainInfo[]} searchedChainInfos The filtered chain information.
 */
export const useGetSearchChains = ({
  search,
  searchOption = "all",
  filterOption = "all",
  initialChainInfos,
  minSearchLength = 0,
  clearResultsOnEmptyQuery,
}: GetSearchChainsParams): {
  trimSearch: string;
  searchedChainInfos: SearchedChainInfo[];
} => {
  const { queriesStore, chainStore, keyRingStore } = useStore();

  const trimSearch = search.trim().toLowerCase();

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("searchOption", searchOption);
    p.set("filterOption", filterOption);
    p.set("searchText", trimSearch);
    return p;
  }, [searchOption, filterOption, trimSearch]);

  const queryChains =
    trimSearch.length >= minSearchLength
      ? queriesStore.simpleQuery.queryGet<{
          chains: ChainInfo[];
        }>("https://kcr-lambda.keplr.app", `/chains?${params.toString()}`)
      : null;

  const [searchedChainInfos, setSearchedChainInfos] = useState<
    SearchedChainInfo[]
  >([]);

  const disabledChainInfosSearched = useMemo(() => {
    return chainStore.groupedModularChainInfosInListUI
      .map((group) => group.modularChainInfo)
      .filter(
        (modularChainInfo) =>
          !chainStore.isEnabledChain(modularChainInfo.chainId) &&
          isChainSupportedByKeyType(
            keyRingStore.selectedKeyInfo?.type,
            modularChainInfo
          )
      )
      .filter((modularChainInfo) => {
        const chainId = modularChainInfo.chainId.toLowerCase();
        const chainName = modularChainInfo.chainName.toLowerCase();

        const u = modularChainInfo.unwrapped;
        let tokenDenom: string;
        switch (u.type) {
          case "cosmos":
            tokenDenom = (
              u.cosmos.stakeCurrency?.coinDenom ||
              u.cosmos.currencies[0]?.coinDenom ||
              ""
            ).toLowerCase();
            break;
          case "ethermint":
            tokenDenom = (
              u.cosmos.stakeCurrency?.coinDenom ||
              u.cosmos.currencies[0]?.coinDenom ||
              ""
            ).toLowerCase();
            break;
          case "evm":
            tokenDenom = (u.evm.nativeCurrency?.coinDenom || "").toLowerCase();
            break;
          case "starknet":
            tokenDenom = (
              u.starknet.currencies[0]?.coinDenom || ""
            ).toLowerCase();
            break;
          case "bitcoin":
            tokenDenom = (
              u.bitcoin.currencies[0]?.coinDenom || ""
            ).toLowerCase();
            break;
          default:
            tokenDenom = "";
        }

        // search text가 eth 또는 eth~ethereum일 경우 evm 체인은 모두 보여준다.
        if (trimSearch.startsWith("eth")) {
          const isEVM =
            modularChainInfo.type === "evm" ||
            modularChainInfo.type === "ethermint";

          if (isEVM) {
            return true;
          }
        }

        switch (filterOption) {
          case "all":
            return (
              chainName.includes(trimSearch) ||
              chainId.includes(trimSearch) ||
              tokenDenom.includes(trimSearch)
            );
          case "chain":
            return (
              chainName.includes(trimSearch) || chainId.includes(trimSearch)
            );
          case "token":
            return tokenDenom.includes(trimSearch);
          case "chainNameAndToken":
            return (
              chainName.includes(trimSearch) || tokenDenom.includes(trimSearch)
            );
          default:
            return false;
        }
      })
      .map((modularChainInfo) => ({
        chainId: modularChainInfo.chainId,
        chainName: modularChainInfo.chainName,
        chainSymbolImageUrl: modularChainInfo.chainSymbolImageUrl,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chainStore.groupedModularChainInfosInListUI,
    filterOption,
    keyRingStore.selectedKeyInfo?.type,
    trimSearch,
  ]);

  useEffect(() => {
    const disposer = autorun(() => {
      if (!queryChains) {
        if (initialChainInfos) {
          setSearchedChainInfos(initialChainInfos);
        } else if (clearResultsOnEmptyQuery) {
          setSearchedChainInfos((prev) => (prev.length > 0 ? [] : prev));
        }
        return;
      }
      if (queryChains.isFetching) return;
      if (queryChains.response?.data) {
        const dupCheck = new Set<string>();
        for (const chain of queryChains.response.data.chains) {
          dupCheck.add(ChainIdHelper.parse(chain.chainId).identifier);
        }

        const chains: SearchedChainInfo[] = queryChains.response.data.chains
          .filter((chainInfo) =>
            isChainSupportedByKeyType(
              keyRingStore.selectedKeyInfo?.type,
              chainInfo
            )
          )
          .map((c) => ({
            chainId: c.chainId,
            chainName: c.chainName,
            chainSymbolImageUrl: c.chainSymbolImageUrl,
            suggestChainInfo: c,
          }));
        for (const disabledChainInfo of disabledChainInfosSearched) {
          if (
            !dupCheck.has(
              ChainIdHelper.parse(disabledChainInfo.chainId).identifier
            )
          ) {
            chains.push(disabledChainInfo);
          }
        }

        setSearchedChainInfos(
          chains.sort((a, b) => a.chainName.localeCompare(b.chainName))
        );
      } else {
        setSearchedChainInfos((prev) => (prev.length > 0 ? [] : prev));
      }
    });

    return () => {
      if (disposer) {
        disposer();
      }
    };
  }, [
    clearResultsOnEmptyQuery,
    initialChainInfos,
    keyRingStore.selectedKeyInfo?.type,
    queryChains,
    disabledChainInfosSearched,
  ]);

  return {
    trimSearch,
    searchedChainInfos,
  };
};
