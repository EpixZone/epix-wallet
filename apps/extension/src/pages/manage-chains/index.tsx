import React, {
  FunctionComponent,
  useState,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { HeaderLayout } from "../../layouts/header";
import { BackButton } from "../../layouts/header/components";
import { SearchTextInput } from "../../components/input";
import { Gutter } from "../../components/gutter";
import { Box } from "../../components/box";
import { useIntl } from "react-intl";
import { useSearchParams } from "react-router-dom";
import { ChainToggleItem } from "./components/chain-toggle-item";
import { useSearch } from "../../hooks/use-search";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { ChainInfo, isEthSignChain } from "@keplr-wallet/types";
import {
  IModularChainInfoImpl,
  getKeplrFromWindow,
} from "@keplr-wallet/stores";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { Stack } from "../../components/stack";
import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";
import { useGetAllNonNativeChain } from "../../hooks/use-get-all-non-native-chain";
import { Columns, Column } from "../../components/column";
import { Subtitle4 } from "../../components/typography";
import { Checkbox } from "../../components/checkbox";
import { EcosystemFilterDropdown } from "./components/ecosystem-filter-dropdown";
import { AllNativeToggleItem } from "./components/all-native-toggle-item";
import { useTheme } from "styled-components";
import { ColorPalette } from "../../styles";
import styled from "styled-components";
import { SelectDerivationPathModal } from "./components/select-derivation-path-modal";
import { ConnectLedgerModal } from "./components/connect-ledger-modal";
import { useKeyCoinTypeFinalize } from "./hooks/use-key-coin-type-finalize";
import { EmbedChainInfos } from "../../config";
import {
  KeyRingCosmosService,
  convertModularChainInfoToChainInfo,
} from "@keplr-wallet/background";
import { determineLedgerApp } from "../../utils/determine-ledger-app";
import { COMMON_HOVER_OPACITY } from "../../styles/constant";
import { isChainSupportedByKeyType } from "../../utils/is-chain-supported-by-key-type";
import { isUsdAggregationShadowedByVisiblePrimaryAsset } from "../../utils/is-usd-aggregation-shadowed-by-visible-primary-asset";

export const Ecosystem = {
  All: "All",
  Cosmos: "Cosmos",
  EVM: "EVM",
  Bitcoin: "Bitcoin",
  Starknet: "Starknet",
} as const;
export type Ecosystem = (typeof Ecosystem)[keyof typeof Ecosystem];

const HideEnabledText = styled(Subtitle4)`
  cursor: pointer;
  &:hover {
    opacity: ${COMMON_HOVER_OPACITY};
  }
`;

export const ManageChainsPage: FunctionComponent = observer(() => {
  const {
    chainStore,
    hugeQueriesStore,
    keyRingStore,
    priceStore,
    uiConfigStore,
  } = useStore();
  const intl = useIntl();
  const [searchParams] = useSearchParams();
  const initialSearchValue = searchParams.get("initialSearchValue") ?? "";
  const [search, setSearch] = useState(initialSearchValue);

  const [selectedEcosystem, setSelectedEcosystem] = useState<Ecosystem>("All");

  const theme = useTheme();

  const [hideEnabled, setHideEnabled] = useState(false);

  const keyType = keyRingStore.selectedKeyInfo?.type;

  const availableEcosystems = useMemo(() => {
    if (keyType === "keystone") {
      return [Ecosystem.All, Ecosystem.Cosmos, Ecosystem.EVM];
    }

    return Object.values(Ecosystem);
  }, [keyType]);

  useEffect(() => {
    if (!availableEcosystems.includes(selectedEcosystem)) {
      setSelectedEcosystem(Ecosystem.All);
    }
  }, [availableEcosystems, selectedEcosystem]);

  const checkIsLedgerSupportedEthermintChain = useCallback(
    (chainInfo: ChainInfo): boolean => {
      if (keyType !== "ledger") {
        return true;
      }

      const modularChainInfo = chainStore.hasModularChain(chainInfo.chainId)
        ? chainStore.getModularChain(chainInfo.chainId)
        : undefined;

      if (modularChainInfo && isEthSignChain(modularChainInfo.unwrapped)) {
        const isEvmOnlyChain = modularChainInfo.type === "evm";

        if (isEvmOnlyChain) {
          return true;
        }

        try {
          if (chainInfo.features?.includes("force-enable-evm-ledger")) {
            return true;
          }

          KeyRingCosmosService.throwErrorIfEthermintWithLedgerButNotSupported(
            chainInfo.chainId
          );
          return true;
        } catch {
          return false;
        }
      }

      return true;
    },
    [keyType, chainStore]
  );

  const { chains: searchedNonNativeChainInfos, infiniteScrollTriggerRef } =
    useGetAllNonNativeChain({
      search,
      fallbackEthereumLedgerApp: false,
      fallbackStarknetLedgerApp: false,
      keyType,
    });

  const vaultId =
    searchParams.get("vaultId") || keyRingStore.selectedKeyInfo?.id;

  const { needFinalizeKeyCoinTypeAction } = useKeyCoinTypeFinalize();

  const [isDerivationModalOpen, setIsDerivationModalOpen] = useState(false);
  const [derivationChainIds, setDerivationChainIds] = useState<string[]>([]);

  const [isConnectLedgerModalOpen, setIsConnectLedgerModalOpen] =
    useState(false);
  const [connectLedgerApp, setConnectLedgerApp] = useState("");
  const [connectLedgerChainId, setConnectLedgerChainId] = useState("");
  const [openEnableChainsRoute, setOpenEnableChainsRoute] = useState(false);

  const [
    backupSelectedNativeChainIdentifiers,
    setBackupSelectedNativeChainIdentifiers,
  ] = useState(chainStore.enabledChainIdentifiers);

  const applyEnableChange = useCallback(
    async (chainId: string, enable: boolean) => {
      if (!vaultId || !chainId) return;

      if (enable) {
        if (!chainStore.hasModularChain(chainId)) {
          const keplr = await getKeplrFromWindow();
          const chainInfoToSuggest = searchedNonNativeChainInfos.find(
            (c) =>
              ChainIdHelper.parse(c.chainId).identifier ===
              ChainIdHelper.parse(chainId).identifier
          );
          if (chainInfoToSuggest && keplr) {
            try {
              await keplr.experimentalSuggestChain(chainInfoToSuggest);
              await keyRingStore.refreshKeyRingStatus();
              await chainStore.updateChainInfosFromBackground();
              await chainStore.updateEnabledChainIdentifiersFromBackground();
            } catch (e) {
              console.error("Failed to suggest chain", chainId, e);
            }
          }
        }

        if (chainStore.hasModularChain(chainId)) {
          const mcType = chainStore.getModularChain(chainId).type;
          if (
            mcType === "cosmos" ||
            mcType === "ethermint" ||
            mcType === "evm"
          ) {
            const needModal = await needFinalizeKeyCoinTypeAction(
              vaultId,
              chainId
            );

            if (needModal) {
              setDerivationChainIds((prev) =>
                prev.includes(chainId) ? prev : [...prev, chainId]
              );
              setIsDerivationModalOpen(true);
            }
          }
        }

        if (chainStore.hasModularChain(chainId)) {
          if (keyRingStore.selectedKeyInfo?.type === "ledger") {
            const modularChainInfo = chainStore.getModularChain(chainId);
            const ledgerApp = determineLedgerApp(modularChainInfo);

            const alreadyAppended = Boolean(
              keyRingStore.selectedKeyInfo?.insensitive?.[ledgerApp]
            );

            if (!alreadyAppended) {
              setConnectLedgerApp(ledgerApp);
              setConnectLedgerChainId(chainId);
              setOpenEnableChainsRoute(false);
              setIsConnectLedgerModalOpen(true);
              return;
            }
          }

          await chainStore.enableChainInfoInUIWithVaultId(vaultId, chainId);
        }
      } else {
        await chainStore.disableChainInfoInUIWithVaultId(vaultId, chainId);
      }
    },
    [
      chainStore,
      vaultId,
      needFinalizeKeyCoinTypeAction,
      keyRingStore,
      searchedNonNativeChainInfos,
    ]
  );

  const tokensByIdentifier = hugeQueriesStore.allTokenMapByChainIdentifier;
  const disabledViewAssetTokenMap =
    uiConfigStore.manageViewAssetTokenConfig.getViewAssetTokenMapByVaultId(
      keyRingStore.selectedKeyInfo?.id ?? ""
    );

  const totalPriceByIdentifier = useMemo(() => {
    const map = new Map<string, Dec>();

    tokensByIdentifier.forEach((tokens, identifier) => {
      const total = tokens.reduce((sum, viewToken) => {
        if (
          isUsdAggregationShadowedByVisiblePrimaryAsset(
            chainStore,
            disabledViewAssetTokenMap,
            viewToken.chainInfo.chainId,
            viewToken.token.currency.coinMinimalDenom
          )
        ) {
          return sum;
        }

        const price =
          viewToken.price ?? priceStore.calculatePrice(viewToken.token);
        return price ? sum.add(price.toDec()) : sum;
      }, new Dec(0));

      map.set(identifier, total);
    });

    return map;
  }, [chainStore, disabledViewAssetTokenMap, priceStore, tokensByIdentifier]);

  const sortPriorityChainIdentifierMap = useMemo(() => {
    const m = new Map<string, boolean>();
    chainStore.enabledChainIdentifiers.forEach((id) => m.set(id, true));
    return m;
  }, [chainStore.enabledChainIdentifiers]);

  const chainSort = useCallback(
    (
      aModularChainInfo: IModularChainInfoImpl | ChainInfo,
      bModularChainInfo: IModularChainInfoImpl | ChainInfo
    ) => {
      const getBaseIdentifier = (
        info: IModularChainInfoImpl | ChainInfo
      ): string => {
        return ChainIdHelper.parse(info.chainId).identifier;
      };

      const aIdentifier = getBaseIdentifier(aModularChainInfo);
      const bIdentifier = getBaseIdentifier(bModularChainInfo);

      if (
        aIdentifier.startsWith("cosmoshub") &&
        !bIdentifier.startsWith("cosmoshub")
      ) {
        return -1;
      }
      if (
        !aIdentifier.startsWith("cosmoshub") &&
        bIdentifier.startsWith("cosmoshub")
      ) {
        return 1;
      }

      if (aIdentifier === "eip155:1" && bIdentifier !== "eip155:1") {
        return -1;
      }
      if (aIdentifier !== "eip155:1" && bIdentifier === "eip155:1") {
        return 1;
      }

      const btcPrefix =
        "bip122:000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";
      const aIsBtc = aIdentifier.startsWith(btcPrefix);
      const bIsBtc = bIdentifier.startsWith(btcPrefix);
      if (aIsBtc && !bIsBtc) return -1;
      if (!aIsBtc && bIsBtc) return 1;

      const aVariantIdentifier = ChainIdHelper.parse(
        aModularChainInfo.chainId
      ).identifier;
      const bVariantIdentifier = ChainIdHelper.parse(
        bModularChainInfo.chainId
      ).identifier;

      const aHasPriority =
        sortPriorityChainIdentifierMap.has(aVariantIdentifier);
      const bHasPriority =
        sortPriorityChainIdentifierMap.has(bVariantIdentifier);
      if (aHasPriority && !bHasPriority) return -1;
      if (!aHasPriority && bHasPriority) return 1;

      const aPrice = totalPriceByIdentifier.get(aIdentifier) ?? new Dec(0);
      const bPrice = totalPriceByIdentifier.get(bIdentifier) ?? new Dec(0);

      if (!aPrice.equals(bPrice)) {
        return aPrice.gt(bPrice) ? -1 : 1;
      }

      return aModularChainInfo.chainName.localeCompare(
        bModularChainInfo.chainName
      );
    },
    [sortPriorityChainIdentifierMap, totalPriceByIdentifier]
  );

  const nativeChainIdentifierSet = useMemo(() => {
    const filtered = EmbedChainInfos.filter((chainInfo) => {
      if ("hideInUI" in chainInfo && chainInfo.hideInUI) {
        return false;
      }

      if (keyType === "ledger") {
        const ci =
          "type" in chainInfo
            ? convertModularChainInfoToChainInfo(chainInfo)
            : (chainInfo as ChainInfo);
        if (ci) {
          return checkIsLedgerSupportedEthermintChain(ci);
        }
      }

      return true;
    });

    return new Set(
      filtered.map(
        (chainInfo) => ChainIdHelper.parse(chainInfo.chainId).identifier
      )
    );
  }, [keyType, checkIsLedgerSupportedEthermintChain]);

  const { nativeGroupedModularChainInfos, suggestGroupedModularChainInfos } =
    useMemo(() => {
      const groups = chainStore.groupedModularChainInfosInListUI.slice();

      const nativeGroupedModularChainInfos = groups
        .filter(
          (group) =>
            nativeChainIdentifierSet.has(
              ChainIdHelper.parse(group.modularChainInfo.chainId).identifier
            ) && isChainSupportedByKeyType(keyType, group.modularChainInfo)
        )
        .sort((a, b) => chainSort(a.modularChainInfo, b.modularChainInfo));

      const suggestGroupedModularChainInfos = groups
        .filter(
          (group) =>
            !nativeChainIdentifierSet.has(
              ChainIdHelper.parse(group.modularChainInfo.chainId).identifier
            ) && isChainSupportedByKeyType(keyType, group.modularChainInfo)
        )
        .sort((a, b) => chainSort(a.modularChainInfo, b.modularChainInfo));

      return {
        nativeGroupedModularChainInfos,
        suggestGroupedModularChainInfos,
      };
    }, [
      chainStore.groupedModularChainInfosInListUI,
      keyType,
      nativeChainIdentifierSet,
      chainSort,
    ]);

  const searchFields = useMemo(
    () => [
      "chainName",
      {
        key: "chainInfo.currency.coinDenom",
        function: (chainInfo: IModularChainInfoImpl | ChainInfo) => {
          if ("type" in chainInfo) {
            const u = chainInfo.unwrapped;
            if (u.type === "cosmos" || u.type === "ethermint") {
              return CoinPretty.makeCoinDenomPretty(
                (u.cosmos.stakeCurrency || u.cosmos.currencies[0]).coinDenom
              );
            } else if (u.type === "evm") {
              return CoinPretty.makeCoinDenomPretty(
                u.evm.nativeCurrency.coinDenom
              );
            } else if (u.type === "starknet") {
              return CoinPretty.makeCoinDenomPretty(
                u.starknet.currencies[0].coinDenom
              );
            } else if (u.type === "bitcoin") {
              return CoinPretty.makeCoinDenomPretty(
                u.bitcoin.currencies[0].coinDenom
              );
            }
            return "";
          }
          // ChainInfo (non-native suggest chains)
          if ("currencies" in chainInfo && chainInfo.currencies.length > 0) {
            return CoinPretty.makeCoinDenomPretty(
              chainInfo.currencies[0].coinDenom
            );
          }
          return "";
        },
      },
    ],
    [chainStore]
  );

  const nativeChains = Array.from(
    new Set([
      ...nativeGroupedModularChainInfos.map((g) => g.modularChainInfo),
      ...suggestGroupedModularChainInfos.map((g) => g.modularChainInfo),
    ])
  ).sort(chainSort);

  const searchedAllChains = useSearch(
    [
      ...nativeChains,
      ...searchedNonNativeChainInfos.filter(
        (chainInfo) => !chainStore.hasModularChain(chainInfo.chainId)
      ),
    ],
    search,
    searchFields
  ).filter((chainInfo) => {
    if (!isChainSupportedByKeyType(keyType, chainInfo)) {
      return false;
    }

    if (keyType === "ledger") {
      if ("type" in chainInfo) {
        // v2: IModularChainInfoImpl
        const ci = convertModularChainInfoToChainInfo(chainInfo.unwrapped);
        if (ci) {
          return checkIsLedgerSupportedEthermintChain(ci);
        }
        return true;
      }
      // ChainInfo (non-native suggest chains)
      if ("currencies" in chainInfo && "feeCurrencies" in chainInfo) {
        return checkIsLedgerSupportedEthermintChain(chainInfo as ChainInfo);
      }

      return true;
    }

    return true;
  });

  const ecosystemFilteredChainInfos = useMemo(() => {
    return searchedAllChains.filter((ci) => {
      if (selectedEcosystem === "All") return true;

      if ("type" in ci) {
        // v2 IModularChainInfoImpl
        switch (selectedEcosystem) {
          case "Cosmos":
            return ci.type === "cosmos" || ci.type === "ethermint";
          case "EVM":
            return ci.type === "evm";
          case "Bitcoin":
            return ci.type === "bitcoin";
          case "Starknet":
            return ci.type === "starknet";
          default:
            return true;
        }
      }

      // ChainInfo (non-native suggest chains from registry — always cosmos/evm family)
      if (!("currencies" in ci && "feeCurrencies" in ci)) {
        return false;
      }
      const isEvmOnly = ci.chainId.startsWith("eip155:");
      switch (selectedEcosystem) {
        case "Cosmos":
          return "bech32Config" in ci && !isEvmOnly;
        case "EVM":
          return "evm" in ci && isEvmOnly;
        case "Bitcoin":
        case "Starknet":
          return false;
        default:
          return true;
      }
    });
  }, [searchedAllChains, selectedEcosystem, chainStore]);

  const visibleChainInfos = useMemo(() => {
    if (!hideEnabled) {
      return ecosystemFilteredChainInfos;
    }
    return ecosystemFilteredChainInfos.filter((ci) => {
      return !chainStore.isEnabledChain(ci.chainId);
    });
  }, [ecosystemFilteredChainInfos, hideEnabled, chainStore]);

  const handleToggle = async (chainIdentifier: string, enable: boolean) => {
    const linkedIdentifiers = (() => {
      if (!chainIdentifier || !chainStore.hasModularChain(chainIdentifier)) {
        return [];
      }

      const modInfo = chainStore.getModularChain(chainIdentifier);

      if (modInfo.embedded.linkedChainKey) {
        const key = modInfo.embedded.linkedChainKey;
        return chainStore.modularChainInfos
          .filter((ci) => ci.embedded.linkedChainKey === key)
          .map((ci) => ChainIdHelper.parse(ci.chainId).identifier);
      }

      return [];
    })();

    const identifiersToChange = new Set<string>([
      chainIdentifier,
      ...linkedIdentifiers,
    ]);

    await Promise.all(
      Array.from(identifiersToChange).map((id) => applyEnableChange(id, enable))
    );
  };

  const processFinalize = async (chainIds: string[]) => {
    if (!vaultId) return;
    let needToOpenModal = false;
    const needDerivationChainIds = new Set<string>();

    await Promise.all(
      chainIds.map(async (chainId) => {
        if (!chainId || !chainStore.hasModularChain(chainId)) return;
        const mcType = chainStore.getModularChain(chainId).type;
        if (mcType !== "cosmos" && mcType !== "ethermint" && mcType !== "evm")
          return;

        const needModal = await needFinalizeKeyCoinTypeAction(vaultId, chainId);
        if (needModal) {
          needDerivationChainIds.add(chainId);
          needToOpenModal = true;
        }
      })
    );

    if (needToOpenModal && needDerivationChainIds.size > 0) {
      setDerivationChainIds(Array.from(needDerivationChainIds).sort());
      setIsDerivationModalOpen(true);
    }
  };

  const handleToggleAllNative = async () => {
    if (!vaultId) return;
    const nativeIds = Array.from(nativeChainIdentifierSet);
    const enabledNativeIds = nativeIds.filter((id) =>
      chainStore.isEnabledChain(id)
    );

    const isAllNativeSelected = enabledNativeIds.length === nativeIds.length;

    if (isAllNativeSelected) {
      if (
        backupSelectedNativeChainIdentifiers.length > 0 &&
        backupSelectedNativeChainIdentifiers.length < nativeIds.length
      ) {
        const toDisable = nativeIds.filter(
          (id) => !backupSelectedNativeChainIdentifiers.includes(id)
        );
        await chainStore.disableChainInfoInUIWithVaultId(vaultId, ...toDisable);
      } else {
        const [first, ...rest] = nativeGroupedModularChainInfos;
        await applyEnableChange(first.modularChainInfo.chainId, true);
        await chainStore.disableChainInfoInUIWithVaultId(
          vaultId,
          ...rest.flatMap((group) => {
            const ids = [group.modularChainInfo.chainId];
            if (group.linkedModularChainInfos) {
              ids.push(
                ...group.linkedModularChainInfos.map((lc) => lc.chainId)
              );
            }
            return ids;
          })
        );
      }
    } else {
      setBackupSelectedNativeChainIdentifiers(enabledNativeIds);

      const idsToEnable = nativeIds.filter(
        (id) => !enabledNativeIds.includes(id)
      );

      if (keyRingStore.selectedKeyInfo?.type === "ledger") {
        const missingLedgerApps = new Set<string>();

        for (const group of nativeGroupedModularChainInfos) {
          const chainId = group.modularChainInfo.chainId;
          const identifier = ChainIdHelper.parse(chainId).identifier;

          if (!idsToEnable.includes(identifier)) {
            continue;
          }

          const ledgerApp = determineLedgerApp(group.modularChainInfo);
          if (!keyRingStore.selectedKeyInfo?.insensitive?.[ledgerApp]) {
            missingLedgerApps.add(ledgerApp);
          }
        }

        if (missingLedgerApps.size > 0) {
          setOpenEnableChainsRoute(true);
          setConnectLedgerApp(Array.from(missingLedgerApps)[0]);
          setConnectLedgerChainId(
            nativeGroupedModularChainInfos[0]?.modularChainInfo.chainId ?? ""
          );
          setIsConnectLedgerModalOpen(true);
          return;
        }
      }

      await chainStore.enableChainInfoInUIWithVaultId(vaultId, ...idsToEnable);
      await processFinalize(idsToEnable);
    }
  };

  const handleDerivationModalClose = async () => {
    if (vaultId && derivationChainIds.length > 0) {
      const toDisable = new Set<string>();

      await Promise.all(
        derivationChainIds.map(async (chainId) => {
          if (!chainId || !chainStore.hasModularChain(chainId)) return;
          const mcType = chainStore.getModularChain(chainId).type;
          if (mcType !== "cosmos" && mcType !== "ethermint" && mcType !== "evm")
            return;
          const stillNeed = await needFinalizeKeyCoinTypeAction(
            vaultId,
            chainId
          );

          if (stillNeed) {
            toDisable.add(chainId);
          }
        })
      );

      if (toDisable.size > 0) {
        await chainStore.disableChainInfoInUIWithVaultId(
          vaultId,
          ...Array.from(toDisable)
        );
      }
    }

    setIsDerivationModalOpen(false);
    setDerivationChainIds([]);
  };

  return (
    <HeaderLayout
      title={intl.formatMessage({
        id: "pages.manage-chains.title",
      })}
      left={<BackButton />}
    >
      <div style={{ padding: "0.75rem" }}>
        <SearchTextInput
          placeholder={intl.formatMessage({
            id: "pages.manage-chains.search-input-placeholder",
          })}
          value={search}
          onChange={(e) => {
            e.preventDefault();
            setSearch(e.target.value);
          }}
        />
        <Gutter size="0.75rem" />

        <Columns sum={1} gutter="0.25rem" alignY="center">
          <EcosystemFilterDropdown
            items={availableEcosystems}
            selected={selectedEcosystem}
            onSelect={setSelectedEcosystem}
          />
          <Column weight={1} />

          {(() => {
            const textColor =
              theme.mode === "light"
                ? hideEnabled
                  ? ColorPalette["gray-300"]
                  : ColorPalette["gray-200"]
                : hideEnabled
                ? ColorPalette["gray-200"]
                : ColorPalette["gray-300"];

            return (
              <HideEnabledText
                onClick={() => setHideEnabled(!hideEnabled)}
                style={{ color: textColor }}
              >
                {intl.formatMessage({
                  id: "pages.manage-chains.hide-enabled-text",
                })}
              </HideEnabledText>
            );
          })()}
          <Gutter size="0.375rem" />
          <Checkbox
            size="extra-small"
            checked={hideEnabled}
            onChange={setHideEnabled}
          />
        </Columns>

        <Gutter size="1rem" />
        <Stack gutter="0.5rem">
          <AllNativeToggleItem
            nativeChainInfos={nativeGroupedModularChainInfos.map(
              (g) => g.modularChainInfo
            )}
            nativeChainIdentifierSet={nativeChainIdentifierSet}
            onToggleAll={() => handleToggleAllNative()}
          />

          {visibleChainInfos.map((ci) => {
            const variantIdentifier = ChainIdHelper.parse(
              ci.chainId
            ).identifier;

            const baseIdentifier = (() => {
              if ("type" in ci && ci.type === "bitcoin") {
                const u = ci.unwrapped;
                if (u.type === "bitcoin") {
                  return ChainIdHelper.parse(u.bitcoin.chainId).identifier;
                }
              }
              return variantIdentifier;
            })();

            const tokens = tokensByIdentifier.get(baseIdentifier) || [];
            const identifier = variantIdentifier;
            return (
              <Box key={identifier}>
                <ChainToggleItem
                  chainInfo={ci}
                  tokens={tokens}
                  enabled={
                    chainStore.isEnabledChain(ci.chainId) &&
                    chainStore.hasModularChain(ci.chainId)
                  }
                  disabled={
                    "type" in ci &&
                    (ci.type === "cosmos" || ci.type === "ethermint")
                      ? chainStore.hasModularChain(ci.chainId)
                        ? !chainStore.isInChainInfosInListUI(ci.chainId)
                        : false
                      : "currencies" in ci && "feeCurrencies" in ci
                      ? chainStore.hasModularChain(ci.chainId)
                        ? !chainStore.isInChainInfosInListUI(ci.chainId)
                        : false
                      : false
                  }
                  isNativeChain={nativeChainIdentifierSet.has(identifier)}
                  onToggle={(enable) => handleToggle(identifier, enable)}
                />
              </Box>
            );
          })}
          <div ref={infiniteScrollTriggerRef} />
        </Stack>
      </div>
      <SelectDerivationPathModal
        isOpen={isDerivationModalOpen}
        close={handleDerivationModalClose}
        chainIds={derivationChainIds}
        vaultId={vaultId || ""}
      />
      <ConnectLedgerModal
        isOpen={isConnectLedgerModalOpen}
        close={() => {
          setIsConnectLedgerModalOpen(false);
          setOpenEnableChainsRoute(false);
          setConnectLedgerApp("");
          setConnectLedgerChainId("");
        }}
        ledgerApp={connectLedgerApp}
        vaultId={vaultId || ""}
        chainId={connectLedgerChainId}
        openEnableChains={openEnableChainsRoute}
      />
    </HeaderLayout>
  );
});
