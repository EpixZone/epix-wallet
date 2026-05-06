import {
  autorun,
  computed,
  flow,
  makeObservable,
  observable,
  runInAction,
  toJS,
} from "mobx";

import { AppCurrency, ChainInfo, ModularChainInfo } from "@keplr-wallet/types";
import {
  ChainStore as BaseChainStore,
  IModularChainInfoImpl,
  ModularChainInfoImpl,
} from "@keplr-wallet/stores";
import { KeyRingStore } from "@keplr-wallet/stores-core";

export type GroupedModularChainInfo = {
  modularChainInfo: IModularChainInfoImpl;
  linkedModularChainInfos?: IModularChainInfoImpl[];
};

import {
  ClearAllChainEndpointsMsg,
  ClearAllSuggestedChainInfosMsg,
  ClearChainEndpointsMsg,
  DisableChainsMsg,
  EnableChainsMsg,
  EnableVaultsWithCosmosAddressMsg,
  GetChainInfosWithCoreTypesMsg,
  GetEnabledChainIdentifiersMsg,
  GetTokenScansMsg,
  RemoveSuggestedChainInfoMsg,
  RevalidateTokenScansMsg,
  SetChainEndpointsMsg,
  ToggleChainsMsg,
  TokenScan,
  TryUpdateAllChainInfosMsg,
  TryUpdateEnabledChainInfosMsg,
  DismissNewTokenFoundInMainMsg,
  TokenScanInfo,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT, MessageRequester } from "@keplr-wallet/router";
import { KVStore, toGenerator } from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { USD_AGGREGATION_SHADOWED_BY } from "../../config";

export type RequiredCurrencyTokenScan = Omit<
  TokenScan,
  "infos" | "dismissedInfos"
> & {
  infos: (Omit<TokenScanInfo, "assets"> & {
    assets: (TokenScan["infos"][number]["assets"][number] & {
      currency: AppCurrency;
    })[];
  })[];
  dismissedInfos?: (Omit<TokenScanInfo, "assets"> & {
    assets: (TokenScan["infos"][number]["assets"][number] & {
      currency: AppCurrency;
    })[];
  })[];
};

export class ChainStore extends BaseChainStore {
  @observable
  protected _isInitializing: boolean = false;

  @observable
  protected _lastSyncedEnabledChainsVaultId: string = "";
  @observable.ref
  protected _enabledChainIdentifiers: string[] = [];

  @observable.ref
  protected _tokenScans: TokenScan[] = [];
  @observable.ref
  protected _tokenScansWithoutDismissed: TokenScan[] = [];

  @observable
  protected _lastTokenScanRevalidateTimestamp: Map<string, number> = new Map();

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly embedChainInfos: (ModularChainInfo | ChainInfo)[],
    protected readonly keyRingStore: KeyRingStore,
    protected readonly requester: MessageRequester,
    protected readonly updateAllChainInfo: boolean
  ) {
    super(
      embedChainInfos.map((chainInfo) => {
        return {
          ...chainInfo,
          ...{
            embedded: true,
          },
        };
      })
    );

    // Should be enabled at least one chain.
    this._enabledChainIdentifiers = [
      ChainIdHelper.parse(embedChainInfos[0].chainId).identifier,
    ];

    makeObservable(this);

    this.init();
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  async waitUntilInitialized(): Promise<void> {
    if (!this.isInitializing) {
      return;
    }

    return new Promise((resolve) => {
      const disposal = autorun(() => {
        if (!this.isInitializing) {
          resolve();

          if (disposal) {
            disposal();
          }
        }
      });
    });
  }

  @computed
  protected get enabledChainIdentifiesMap(): Map<string, true> {
    if (this._enabledChainIdentifiers.length === 0) {
      // Should be enabled at least one chain.
      const map = new Map<string, true>();
      map.set(
        ChainIdHelper.parse(this.embedChainInfos[0].chainId).identifier,
        true
      );
      return map;
    }

    const map = new Map<string, true>();
    for (const chainIdentifier of this._enabledChainIdentifiers) {
      map.set(chainIdentifier, true);
    }
    return map;
  }

  @computed
  get tokenScans(): RequiredCurrencyTokenScan[] {
    let res = this._tokenScans.filter((scan) => {
      if (!this.hasModularChain(scan.chainId)) {
        return false;
      }

      const chainIdentifier = ChainIdHelper.parse(scan.chainId).identifier;
      return !this.enabledChainIdentifiesMap.get(chainIdentifier);
    });

    res = res
      .map((scan) => {
        return {
          ...scan,
          infos: scan.infos
            .map((info) => {
              return {
                ...info,
                assets: info.assets
                  .map((asset) => {
                    if (asset.currency) {
                      return asset;
                    }

                    if (asset.coinMinimalDenom) {
                      if (this.hasModularChain(scan.chainId)) {
                        const currency = this.getModularChain(
                          scan.chainId
                        ).findCurrency(asset.coinMinimalDenom);
                        if (currency) {
                          return {
                            ...asset,
                            currency,
                          };
                        }
                      }
                    }

                    return asset;
                  })
                  .filter((asset) => {
                    return !!asset.currency;
                  }),
              };
            })
            .filter((info) => {
              return info.assets.length > 0;
            }),
        };
      })
      .filter((scan) => {
        return scan.infos.length > 0;
      });

    return res as RequiredCurrencyTokenScan[];
  }

  @computed
  get tokenScansWithoutDismissed(): RequiredCurrencyTokenScan[] {
    let res = this._tokenScansWithoutDismissed.filter((scan) => {
      if (!this.hasModularChain(scan.chainId)) {
        return false;
      }

      const chainIdentifier = ChainIdHelper.parse(scan.chainId).identifier;
      return !this.enabledChainIdentifiesMap.get(chainIdentifier);
    });

    res = res
      .map((scan) => {
        return {
          ...scan,
          infos: scan.infos
            .map((info) => {
              return {
                ...info,
                assets: info.assets
                  .map((asset) => {
                    if (asset.currency) {
                      return asset;
                    }

                    if (asset.coinMinimalDenom) {
                      if (this.hasModularChain(scan.chainId)) {
                        const currency = this.getModularChain(
                          scan.chainId
                        ).findCurrency(asset.coinMinimalDenom);
                        if (currency) {
                          return {
                            ...asset,
                            currency,
                          };
                        }
                      }
                    }

                    return asset;
                  })
                  .filter((asset) => {
                    return !!asset.currency;
                  }),
              };
            })
            .filter((info) => {
              return info.assets.length > 0;
            }),
        };
      })
      .filter((scan) => {
        return scan.infos.length > 0;
      });

    return res as RequiredCurrencyTokenScan[];
  }

  @computed
  override get modularChainInfos(): ModularChainInfoImpl[] {
    // Sort by chain name.
    // The first chain has priority to be the first.
    return super.modularChainInfos.slice().sort((a, b) => {
      const aChainIdentifier = ChainIdHelper.parse(a.chainId).identifier;
      const bChainIdentifier = ChainIdHelper.parse(b.chainId).identifier;

      if (
        aChainIdentifier ===
        ChainIdHelper.parse(this.embedChainInfos[0].chainId).identifier
      ) {
        return -1;
      }
      if (
        bChainIdentifier ===
        ChainIdHelper.parse(this.embedChainInfos[0].chainId).identifier
      ) {
        return 1;
      }

      return a.chainName.trim().localeCompare(b.chainName.trim());
    });
  }

  @computed
  get modularChainInfosInUI(): IModularChainInfoImpl[] {
    return this.modularChainInfos.filter((modularChainInfo) => {
      if (modularChainInfo.hideInUI) {
        return false;
      }
      const chainIdentifier = ChainIdHelper.parse(
        modularChainInfo.chainId
      ).identifier;

      return this.enabledChainIdentifiesMap.get(chainIdentifier);
    });
  }

  @computed
  get groupedModularChainInfos(): GroupedModularChainInfo[] {
    const linkedChainInfosByChainKey = new Map<
      string,
      IModularChainInfoImpl[]
    >();
    const grouped: GroupedModularChainInfo[] = [];

    for (const modularChainInfo of this.modularChainInfos) {
      if (modularChainInfo.linkedChainKey) {
        const linkedChainKey = modularChainInfo.linkedChainKey;
        const linkedChainInfos = linkedChainInfosByChainKey.get(linkedChainKey);
        if (linkedChainInfos) {
          linkedChainInfos.push(modularChainInfo);
        } else {
          linkedChainInfosByChainKey.set(linkedChainKey, [modularChainInfo]);
        }
      } else {
        grouped.push({ modularChainInfo });
      }
    }

    for (const linkedChainInfos of linkedChainInfosByChainKey.values()) {
      if (linkedChainInfos.length > 1) {
        grouped.push({
          modularChainInfo: linkedChainInfos[0],
          linkedModularChainInfos: linkedChainInfos.slice(1),
        });
      }
    }

    return grouped;
  }

  @computed
  get groupedModularChainInfosInUI() {
    return this.groupedModularChainInfos.filter((group) => {
      if (group.modularChainInfo.hideInUI) {
        return false;
      }

      const chainIdentifier = ChainIdHelper.parse(
        group.modularChainInfo.chainId
      ).identifier;

      return this.enabledChainIdentifiesMap.get(chainIdentifier);
    });
  }

  @computed
  get modularChainInfosInListUI(): IModularChainInfoImpl[] {
    return this.modularChainInfos.filter((modularChainInfo) => {
      return !modularChainInfo.hideInUI;
    });
  }

  @computed
  get groupedModularChainInfosInListUI() {
    return this.groupedModularChainInfos.filter((group) => {
      return !group.modularChainInfo.hideInUI;
    });
  }

  get enabledChainIdentifiers(): string[] {
    return this._enabledChainIdentifiers;
  }

  isEnabledChain(chainId: string): boolean {
    const chainIdentifier = ChainIdHelper.parse(chainId).identifier;
    return this.enabledChainIdentifiesMap.get(chainIdentifier) === true;
  }

  getUsdAggregationShadowPrimaryAsset(
    chainId: string,
    coinMinimalDenom: string
  ): { chainId: string; coinMinimalDenom: string } | undefined {
    const rule = USD_AGGREGATION_SHADOWED_BY[chainId];
    if (!rule) return;
    if (!rule.denoms.has(coinMinimalDenom)) return;
    if (!this.isEnabledChain(rule.primary.chainId)) return;
    return rule.primary;
  }

  isUsdAggregationShadowed(chainId: string, coinMinimalDenom: string): boolean {
    return !!this.getUsdAggregationShadowPrimaryAsset(
      chainId,
      coinMinimalDenom
    );
  }

  @computed
  protected get chainInfosInListUIMap(): Map<string, true> {
    const map = new Map<string, true>();
    for (const chainInfo of this.modularChainInfosInListUI) {
      map.set(ChainIdHelper.parse(chainInfo.chainId).identifier, true);
    }
    return map;
  }

  isInChainInfosInListUI(chainId: string): boolean {
    return (
      this.chainInfosInListUIMap.get(
        ChainIdHelper.parse(chainId).identifier
      ) === true
    );
  }

  @flow
  *toggleChainInfoInUI(...chainIds: string[]) {
    if (!this.keyRingStore.selectedKeyInfo) {
      return;
    }

    const msg = new ToggleChainsMsg(
      this.keyRingStore.selectedKeyInfo.id,
      chainIds
    );
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
  }

  @flow
  *enableChainInfoInUI(...chainIds: string[]) {
    if (!this.keyRingStore.selectedKeyInfo) {
      return;
    }

    const msg = new EnableChainsMsg(
      this.keyRingStore.selectedKeyInfo.id,
      chainIds
    );
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
  }

  @flow
  *enableChainInfoInUIWithVaultId(vaultId: string, ...chainIds: string[]) {
    const msg = new EnableChainsMsg(vaultId, chainIds);
    const enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    if (this.keyRingStore.selectedKeyInfo?.id === vaultId) {
      this._enabledChainIdentifiers = enabledChainIdentifiers;
    }
  }

  @flow
  *disableChainInfoInUI(...chainIds: string[]) {
    if (!this.keyRingStore.selectedKeyInfo) {
      return;
    }

    const msg = new DisableChainsMsg(
      this.keyRingStore.selectedKeyInfo.id,
      chainIds
    );
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
  }

  @flow
  *disableChainInfoInUIWithVaultId(vaultId: string, ...chainIds: string[]) {
    const msg = new DisableChainsMsg(vaultId, chainIds);
    const enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    if (this.keyRingStore.selectedKeyInfo?.id === vaultId) {
      this._enabledChainIdentifiers = enabledChainIdentifiers;
    }
  }

  @flow
  *dismissNewTokenFoundInMain() {
    const msg = new DismissNewTokenFoundInMainMsg(
      this.keyRingStore.selectedKeyInfo?.id ?? ""
    );

    const res = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    if (this.keyRingStore.selectedKeyInfo?.id === msg.vaultId) {
      this._tokenScans = res.tokenScans;
      this._tokenScansWithoutDismissed = res.tokenScansWithoutDismissed;
    }
  }

  @flow
  protected *init() {
    this._isInitializing = true;

    yield this.keyRingStore.waitUntilInitialized();

    const lastTokenScanRevalidateTimestamp = yield* toGenerator(
      this.kvStore.get<Record<string, number>>(
        "lastTokenScanRevalidateTimestamp"
      )
    );
    if (lastTokenScanRevalidateTimestamp) {
      for (const [key, value] of Object.entries(
        lastTokenScanRevalidateTimestamp
      )) {
        runInAction(() => {
          this._lastTokenScanRevalidateTimestamp.set(key, value);
        });
      }
    }
    autorun(() => {
      autorun(() => {
        const js = toJS(this._lastTokenScanRevalidateTimestamp);
        const obj = Object.fromEntries(js);
        this.kvStore.set<Record<string, number>>(
          "lastTokenScanRevalidateTimestamp",
          obj
        );
      });
    });

    yield Promise.all([
      this.updateChainInfosFromBackground(),
      this.updateEnabledChainIdentifiersFromBackground(),
    ]);

    autorun(() => {
      // Change the enabled chain identifiers when the selected key info is changed.
      if (this.keyRingStore.selectedKeyInfo) {
        if (
          this._lastSyncedEnabledChainsVaultId ===
          this.keyRingStore.selectedKeyInfo.id
        ) {
          return;
        }
        this.updateEnabledChainIdentifiersFromBackground();
      }
    });

    this._isInitializing = false;

    // Must not wait!!
    if (!this.updateAllChainInfo) {
      this.tryUpdateEnabledChainInfos();
    } else {
      this.tryUpdateAllChainInfos();
    }
  }

  async tryUpdateEnabledChainInfos(): Promise<void> {
    const msg = new TryUpdateEnabledChainInfosMsg();
    const updated = await this.requester.sendMessage(BACKGROUND_PORT, msg);
    if (updated) {
      await this.updateChainInfosFromBackground();
    }
  }

  async tryUpdateAllChainInfos(): Promise<void> {
    const msg = new TryUpdateAllChainInfosMsg();
    const updated = await this.requester.sendMessage(BACKGROUND_PORT, msg);
    if (updated) {
      await this.updateChainInfosFromBackground();
    }
  }

  @flow
  *updateChainInfosFromBackground() {
    const msg = new GetChainInfosWithCoreTypesMsg();
    const result = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    this.setEmbeddedChainInfos(result.modularChainInfos);
  }

  @flow
  *enableVaultsWithCosmosAddress(chainId: string, bech32Address: string) {
    const msg = new EnableVaultsWithCosmosAddressMsg(chainId, bech32Address);
    const res = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    const changed = res.find(
      (r) => r.vaultId === this.keyRingStore.selectedKeyInfo?.id
    );
    if (changed) {
      this._enabledChainIdentifiers = changed.newEnabledChains as string[];
    }
  }

  @flow
  *updateEnabledChainIdentifiersFromBackground() {
    if (!this.keyRingStore.selectedKeyInfo) {
      this._lastSyncedEnabledChainsVaultId = "";
      return;
    }

    const id = this.keyRingStore.selectedKeyInfo.id;
    const msg = new GetEnabledChainIdentifiersMsg(id);
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    const getTokenScansResult = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, new GetTokenScansMsg(id))
    );

    if (this.keyRingStore.selectedKeyInfo?.id === getTokenScansResult.vaultId) {
      this._tokenScans = getTokenScansResult.tokenScans;
      this._tokenScansWithoutDismissed =
        getTokenScansResult.tokenScansWithoutDismissed;
    }

    (async () => {
      await new Promise<void>((resolve) => {
        const disposal = autorun(() => {
          if (this.keyRingStore.status === "unlocked") {
            resolve();

            if (disposal) {
              disposal();
            }
          }
        });
      });

      const lastTimestamp = this._lastTokenScanRevalidateTimestamp.get(id);
      if (
        lastTimestamp == null ||
        Date.now() - lastTimestamp > 5 * 60 * 60 * 1000
      ) {
        runInAction(() => {
          this._lastTokenScanRevalidateTimestamp.set(id, Date.now());
        });

        const res = await this.requester.sendMessage(
          BACKGROUND_PORT,
          new RevalidateTokenScansMsg(id)
        );

        if (res.vaultId === this.keyRingStore.selectedKeyInfo?.id) {
          runInAction(() => {
            this._tokenScans = res.tokenScans;
            this._tokenScansWithoutDismissed = res.tokenScansWithoutDismissed;
          });
        }
      }
    })();

    this._lastSyncedEnabledChainsVaultId = id;
  }

  // Enabled chains depends on the selected key info.
  // This process is automatically done when the selected key info is changed. (see init())
  // But, if you want to wait until the enabled chains are synced, you can use this getter.
  @computed
  get isEnabledChainsSynced(): boolean {
    return !!(
      this.keyRingStore.selectedKeyInfo &&
      this.keyRingStore.selectedKeyInfo.id ===
        this._lastSyncedEnabledChainsVaultId
    );
  }

  get lastSyncedEnabledChainsVaultId(): string {
    return this._lastSyncedEnabledChainsVaultId;
  }

  // Enabled chains depends on the selected key info.
  // This process is automatically done when the selected key info is changed. (see init())
  // But, if you want to wait until the enabled chains are synced, you can use this method.
  async waitSyncedEnabledChains(): Promise<void> {
    if (
      this.keyRingStore.selectedKeyInfo &&
      this.keyRingStore.selectedKeyInfo.id ===
        this._lastSyncedEnabledChainsVaultId
    ) {
      return;
    }

    return new Promise((resolve) => {
      const disposal = autorun(() => {
        if (
          this.keyRingStore.selectedKeyInfo &&
          this.keyRingStore.selectedKeyInfo.id ===
            this._lastSyncedEnabledChainsVaultId
        ) {
          resolve();

          if (disposal) {
            disposal();
          }
        }
      });
    });
  }

  @flow
  *removeChainInfo(chainId: string) {
    const msg = new RemoveSuggestedChainInfoMsg(chainId);
    const res = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfos(res.modularChainInfos);
  }

  @flow
  *setChainEndpoints(
    chainId: string,
    rpc: string | undefined,
    rest: string | undefined,
    evmRpc: string | undefined
  ) {
    const msg = new SetChainEndpointsMsg(chainId, rpc, rest, evmRpc);
    const res = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfos(res.modularChainInfos);
  }

  @flow
  *resetChainEndpoints(chainId: string) {
    const msg = new ClearChainEndpointsMsg(chainId);
    const res = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfos(res.modularChainInfos);
  }

  // I use Async, Await because it doesn't change the state value.
  async clearClearAllSuggestedChainInfos() {
    const msg = new ClearAllSuggestedChainInfosMsg();
    await this.requester.sendMessage(BACKGROUND_PORT, msg);
  }

  // I use Async, Await because it doesn't change the state value.
  async clearAllChainEndpoints() {
    const msg = new ClearAllChainEndpointsMsg();
    await this.requester.sendMessage(BACKGROUND_PORT, msg);
  }
}
