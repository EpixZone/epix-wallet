import { KVStore, PrefixKVStore } from "@keplr-wallet/common";
import { action, autorun, makeObservable, observable, runInAction } from "mobx";
import { ChainStore } from "../chain";
import { computedFn } from "mobx-utils";
import { IQueriesStore, IModularChainInfoImpl } from "@keplr-wallet/stores";
import { AppCurrency } from "@keplr-wallet/types";

export class IBCSwapConfig {
  protected readonly kvStore: KVStore;

  // 사실 UI 관련된 얘들은 ui config store 밑에 넣거나... 다른 곳으로 빠지는게 맞는 것 같지만...
  // 일단은 귀찮아서 여기서 처리한다...
  @observable
  protected _lastAmountInChainId: string = "";
  @observable
  protected _lastAmountInMinimalDenom: string = "";
  @observable
  protected _lastAmountOutChainId: string = "";
  @observable
  protected _lastAmountOutMinimalDenom: string = "";

  @observable
  protected _lastSlippage: string = "0.5";
  @observable
  protected _lastSlippageIsCustom: boolean = false;

  @observable
  protected _celestiaDisabled: boolean = false;

  @observable
  protected _isSwapExecuting: Map<string, boolean> = new Map();

  // multi tx swap signature progress state
  @observable
  protected _totalSignatureCount: number | undefined = undefined;
  @observable
  protected _completedSignatureCount: number | undefined = undefined;
  @observable
  protected _showSignatureProgress: boolean = false;

  constructor(
    kvStore: KVStore,
    protected readonly chainStore: ChainStore,
    protected readonly queriesStore: IQueriesStore
  ) {
    this.kvStore = new PrefixKVStore(kvStore, "ibc-swap");

    makeObservable(this);
  }

  async init(): Promise<void> {
    const saved = await this.kvStore.get<{
      lastAmountInChainId: string;
      lastAmountInMinimalDenom: string;
      lastAmountOutChainId: string;
      lastAmountOutMinimalDenom: string;
    }>("ibc-swap-amount-in-out-info");
    if (saved) {
      runInAction(() => {
        if (saved.lastAmountInChainId) {
          this._lastAmountInChainId = saved.lastAmountInChainId;
        }
        if (saved.lastAmountInMinimalDenom) {
          this._lastAmountInMinimalDenom = saved.lastAmountInMinimalDenom;
        }
        if (saved.lastAmountOutChainId) {
          this._lastAmountOutChainId = saved.lastAmountOutChainId;
        }
        if (saved.lastAmountOutMinimalDenom) {
          this._lastAmountOutMinimalDenom = saved.lastAmountOutMinimalDenom;
        }
      });
    }

    const savedSlippage = await this.kvStore.get<{
      lastSlippage: string;
      lastSlippageIsCustom: boolean;
    }>("ibc-swap-slippage");
    if (savedSlippage) {
      runInAction(() => {
        if (savedSlippage.lastSlippage != null) {
          this._lastSlippage = savedSlippage.lastSlippage;
        }
        if (savedSlippage.lastSlippageIsCustom != null) {
          this._lastSlippageIsCustom = savedSlippage.lastSlippageIsCustom;
        }
      });
    }

    autorun(() => {
      this.kvStore.set("ibc-swap-amount-in-out-info", {
        lastAmountInChainId: this._lastAmountInChainId,
        lastAmountInMinimalDenom: this._lastAmountInMinimalDenom,
        lastAmountOutChainId: this._lastAmountOutChainId,
        lastAmountOutMinimalDenom: this._lastAmountOutMinimalDenom,
      });
    });

    autorun(() => {
      this.kvStore.set("ibc-swap-slippage", {
        lastSlippage: this._lastSlippage,
        lastSlippageIsCustom: this._lastSlippageIsCustom,
      });
    });

    autorun(() => {
      const res = this.queriesStore.simpleQuery.queryGet<{
        disabled?: boolean;
      }>(
        process.env["KEPLR_EXT_CONFIG_SERVER"],
        "/celestia-ibc-disable/config.json"
      );
      if (res.response?.data["disabled"] === true) {
        runInAction(() => {
          this._celestiaDisabled = true;
        });
      }
    });
  }

  getAmountInChainInfo = computedFn((): IModularChainInfoImpl => {
    if (
      this._lastAmountInChainId &&
      this.chainStore.hasModularChain(this._lastAmountInChainId) &&
      this.chainStore.isEnabledChain(this._lastAmountInChainId)
    ) {
      return this.chainStore.getModularChain(this._lastAmountInChainId);
    }

    return this.chainStore.modularChainInfosInUI[0];
  });

  @action
  setAmountInChainId(chainId: string) {
    this._lastAmountInChainId = chainId;
  }

  getAmountInCurrency = computedFn((): AppCurrency => {
    const modularChainInfo = this.getAmountInChainInfo();
    if (this._lastAmountInMinimalDenom) {
      const currency = modularChainInfo.findCurrency(
        this._lastAmountInMinimalDenom
      );
      if (currency) {
        return currency;
      }
    }

    const u = modularChainInfo.unwrapped;
    switch (u.type) {
      case "cosmos":
        return u.cosmos.stakeCurrency ?? u.cosmos.currencies[0];
      case "ethermint":
        return u.cosmos.stakeCurrency ?? u.cosmos.currencies[0];
      case "evm":
        return u.evm.nativeCurrency;
      case "starknet":
        return u.starknet.currencies[0];
      case "bitcoin":
        return u.bitcoin.currencies[0];
    }
  });

  @action
  setAmountInMinimalDenom(denom: string) {
    this._lastAmountInMinimalDenom = denom;
  }

  getAmountOutChainInfo = computedFn((): IModularChainInfoImpl => {
    if (
      this._lastAmountOutChainId &&
      this.chainStore.hasModularChain(this._lastAmountOutChainId)
    ) {
      return this.chainStore.getModularChain(this._lastAmountOutChainId);
    }

    if (this.getAmountInChainInfo().chainIdentifier !== "osmosis") {
      const findIndex = this.chainStore.modularChainInfosInUI.findIndex(
        (c) => c.chainIdentifier === "osmosis"
      );
      if (findIndex >= 0) {
        return this.chainStore.modularChainInfosInUI[findIndex];
      }
    }

    if (this.chainStore.modularChainInfosInUI.length >= 2) {
      return this.chainStore.modularChainInfosInUI[1];
    }

    // Enabled된 체인들이 한개만 있을수도 있다는 점을 고려해야한다. 그러므로 chain infos in ui에서 두번째 체인을 찾을 수 없다면
    // 그것과 상관없이 chain infos에서 찾는다.
    const find = this.chainStore.modularChainInfos.find((mc) => {
      return mc.chainIdentifier !== this.getAmountInChainInfo().chainIdentifier;
    });
    if (find) {
      return find;
    }
    return this.chainStore.modularChainInfos[0];
  });

  @action
  setAmountOutChainId(chainId: string) {
    this._lastAmountOutChainId = chainId;
  }

  // Whether a destination was ever actually picked (by the user or a deep
  // link). Before that, getAmountOutChainInfo() has to invent a fallback
  // chain, and the UI shows a "Select token" placeholder instead of
  // presenting that fallback as a real choice.
  get isAmountOutChosen(): boolean {
    return (
      !!this._lastAmountOutChainId &&
      this.chainStore.hasModularChain(this._lastAmountOutChainId)
    );
  }

  getAmountOutCurrency = computedFn((): AppCurrency => {
    const modularChainInfo = this.getAmountOutChainInfo();
    if (this._lastAmountOutMinimalDenom) {
      return modularChainInfo.forceFindCurrency(
        this._lastAmountOutMinimalDenom
      );
    }

    const u = modularChainInfo.unwrapped;
    switch (u.type) {
      case "cosmos":
        return u.cosmos.stakeCurrency ?? u.cosmos.currencies[0];
      case "ethermint":
        return u.cosmos.stakeCurrency ?? u.cosmos.currencies[0];
      case "evm":
        return u.evm.nativeCurrency;
      case "starknet":
        return u.starknet.currencies[0];
      case "bitcoin":
        return u.bitcoin.currencies[0];
    }
  });

  @action
  setAmountOutMinimalDenom(denom: string) {
    this._lastAmountOutMinimalDenom = denom;
  }

  get slippage(): string {
    return this._lastSlippage;
  }

  @action
  setSlippage(slippage: string) {
    this._lastSlippage = slippage;
  }

  get slippageIsCustom(): boolean {
    return this._lastSlippageIsCustom;
  }

  @action
  setSlippageIsCustom(isCustom: boolean) {
    this._lastSlippageIsCustom = isCustom;
  }

  get slippageIsValid(): boolean {
    const trim = this.slippage.trim();

    if (trim === "") {
      return false;
    }

    const num = parseFloat(trim);
    if (Number.isNaN(num)) {
      return false;
    }

    return num >= 0;
  }

  get slippageNum(): number {
    const trim = this.slippage.trim();
    return parseFloat(trim);
  }

  async removeStatesWhenErrorOccurredDuringRendering() {
    await this.kvStore.set("ibc-swap-amount-in-out-info", null);
    await this.kvStore.set("ibc-swap-slippage", null);
  }

  get celestiaDisabled(): boolean {
    return this._celestiaDisabled;
  }

  get isSwapExecuting(): boolean {
    return this._isSwapExecuting.get("default") ?? false;
  }

  getIsSwapExecuting(key: string): boolean {
    return this._isSwapExecuting.get(key) ?? false;
  }

  @action
  setIsSwapExecuting(isExecuting: boolean, key: string = "default") {
    if (isExecuting) {
      this._isSwapExecuting.set(key, isExecuting);
    } else {
      this._isSwapExecuting.delete(key);
    }
  }

  get signatureProgress(): { show: boolean; total: number; completed: number } {
    const total = this._totalSignatureCount ?? 0;
    const completed = this._completedSignatureCount ?? 0;

    return {
      show:
        this._showSignatureProgress &&
        this._totalSignatureCount != null &&
        this._completedSignatureCount != null,
      total,
      completed,
    };
  }

  @action
  setSignatureProgress(total: number, completed: number, show: boolean) {
    this._totalSignatureCount = total;
    this._completedSignatureCount = completed;
    this._showSignatureProgress = show;
  }

  @action
  incrementCompletedSignature() {
    if (this._completedSignatureCount != null) {
      this._completedSignatureCount += 1;
    }
  }

  @action
  resetSignatureProgress() {
    this._totalSignatureCount = undefined;
    this._completedSignatureCount = undefined;
    this._showSignatureProgress = false;
  }
}
