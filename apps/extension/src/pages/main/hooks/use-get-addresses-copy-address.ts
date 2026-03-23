import { CoinPretty } from "@keplr-wallet/unit";
import { Address } from "../components/deposit-modal/copy-address-scene";
import { useSearch } from "../../../hooks/use-search";
import { useStore } from "../../../stores";
import { useMemo, useState } from "react";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { isChainSupportedByKeyType } from "../../../utils/is-chain-supported-by-key-type";

const addressSearchFields = [
  "modularChainInfo.chainName",
  "modularChainInfo.chainId",
  {
    key: "bech32Address",
    function: (item: Address) => {
      if (item.bech32Address) {
        const bech32Split = item.bech32Address.split("1");
        return bech32Split.length > 0 ? bech32Split[0] : "";
      }
      return "";
    },
  },
  {
    key: "modularChainInfo.currency.coinDenom",
    function: (item: Address) => {
      const u = item.modularChainInfo.unwrapped;
      if (u.type === "cosmos" || u.type === "ethermint") {
        if (u.cosmos.stakeCurrency) {
          return CoinPretty.makeCoinDenomPretty(
            u.cosmos.stakeCurrency.coinDenom
          );
        }
        if (u.cosmos.currencies.length > 0) {
          const currency = u.cosmos.currencies[0];
          if (!currency.coinMinimalDenom.startsWith("ibc/")) {
            return CoinPretty.makeCoinDenomPretty(currency.coinDenom);
          }
        }
      } else if (u.type === "evm") {
        return CoinPretty.makeCoinDenomPretty(u.evm.nativeCurrency.coinDenom);
      } else if (u.type === "starknet") {
        if (u.starknet.currencies.length > 0) {
          return CoinPretty.makeCoinDenomPretty(
            u.starknet.currencies[0].coinDenom
          );
        }
      } else if (u.type === "bitcoin") {
        if (u.bitcoin.currencies.length > 0) {
          return CoinPretty.makeCoinDenomPretty(
            u.bitcoin.currencies[0].coinDenom
          );
        }
      }
      return "";
    },
  },
];

const useSearchAddressOnCopyAddress = (
  addresses: Address[],
  search: string
) => {
  return useSearch(addresses, search, addressSearchFields);
};

export const useGetAddressesOnCopyAddress = (search: string) => {
  const { chainStore, accountStore, keyRingStore, uiConfigStore } = useStore();

  // 북마크된 체인과 sorting을 위한 state는 분리되어있다.
  // 이걸 분리하지 않고 북마크된 체인은 무조건 올린다고 가정하면
  // 유저 입장에서 북마크 버튼을 누르는 순간 그 체인은 위로 올라가게 되고
  // 아래에 있던 체인의 경우는 유저가 보기에 갑자기 사라진 것처럼 보일 수 있고
  // 그게 아니더라도 추가적인 인터렉션을 위해서 스크롤이 필요해진다.
  // 이 문제를 해결하기 위해서 state가 분리되어있다.
  // 처음 시자할때는 북마크된 체인 기준으로 하고 이후에 북마크가 해제된 체인의 경우만 정렬 우선순위에서 뺀다.
  const [sortPriorities, setSortPriorities] = useState<
    Record<string, true | undefined>
  >(() => {
    if (!keyRingStore.selectedKeyInfo) {
      return {};
    }
    const res: Record<string, true | undefined> = {};
    for (const modularChainInfo of chainStore.modularChainInfosInUI) {
      if (
        uiConfigStore.copyAddressConfig.isBookmarkedChain(
          keyRingStore.selectedKeyInfo.id,
          modularChainInfo.chainId
        )
      ) {
        res[ChainIdHelper.parse(modularChainInfo.chainId).identifier] = true;
      }
    }
    return res;
  });

  const addresses: Address[] = useMemo(() => {
    return chainStore.modularChainInfosInUI
      .filter((modularChainInfo) =>
        isChainSupportedByKeyType(
          keyRingStore.selectedKeyInfo?.type,
          modularChainInfo
        )
      )
      .map((modularChainInfo) => {
        const accountInfo = accountStore.getAccount(modularChainInfo.chainId);

        const bech32Address = (() => {
          if (
            modularChainInfo.type !== "cosmos" &&
            modularChainInfo.type !== "ethermint"
          ) {
            return undefined;
          }

          if (
            modularChainInfo.type === "ethermint" &&
            modularChainInfo.chainId.startsWith("eip155")
          ) {
            return undefined;
          }

          return accountInfo.bech32Address;
        })();
        const ethereumAddress = (() => {
          if (
            modularChainInfo.type !== "cosmos" &&
            modularChainInfo.type !== "ethermint" &&
            modularChainInfo.type !== "evm"
          ) {
            return undefined;
          }

          if (modularChainInfo.chainId.startsWith("injective")) {
            return undefined;
          }

          return accountInfo.hasEthereumHexAddress
            ? accountInfo.ethereumHexAddress
            : undefined;
        })();
        const starknetAddress = (() => {
          if (modularChainInfo.type !== "starknet") {
            return undefined;
          }

          return accountInfo.starknetHexAddress;
        })();

        const bitcoinAddress = (() => {
          if (modularChainInfo.type !== "bitcoin") {
            return undefined;
          }

          return accountInfo.bitcoinAddress;
        })();

        return {
          modularChainInfo: modularChainInfo,
          bech32Address,
          ethereumAddress,
          starknetAddress,
          bitcoinAddress,
        };
      });
  }, [
    accountStore,
    chainStore.modularChainInfosInUI,
    keyRingStore.selectedKeyInfo?.type,
  ]);

  const searchedAddresses = useSearchAddressOnCopyAddress(addresses, search);

  const sortedAddresses = useMemo(() => {
    return searchedAddresses.sort((a, b) => {
      const aChainIdentifier = ChainIdHelper.parse(
        a.modularChainInfo.chainId
      ).identifier;
      const bChainIdentifier = ChainIdHelper.parse(
        b.modularChainInfo.chainId
      ).identifier;

      const aPriority = sortPriorities[aChainIdentifier];
      const bPriority = sortPriorities[bChainIdentifier];

      if (aPriority && bPriority) {
        return 0;
      }
      if (aPriority) {
        return -1;
      }
      if (bPriority) {
        return 1;
      }
      return 0;
    });
  }, [searchedAddresses, sortPriorities]);

  return {
    sortedAddresses,
    setSortPriorities,
  };
};
