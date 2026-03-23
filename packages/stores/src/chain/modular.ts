import { DenomHelper, sortedJsonByKeyStringify } from "@keplr-wallet/common";
import {
  AppCurrency,
  ModularChainInfo,
  ModularChainInfoByType,
  ModularChainInfoTypeNames,
} from "@keplr-wallet/types";
import {
  action,
  autorun,
  computed,
  IReactionDisposer,
  makeObservable,
  observable,
  runInAction,
} from "mobx";
import { CurrencyRegistrar } from "./types";
import { keepAlive } from "mobx-utils";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import {
  getCurrencyMapFromModularChainInfo,
  unwrapModularChainInfo,
} from "./unwrap";

/**
 * ModularChainInfo v2의 public 인터페이스.
 *
 * v1(ModularChainInfo)이 structural union("cosmos" in info)으로 체인 타입을 구분했던 것과 달리,
 * v2는 discriminated union의 `type` 필드로 체인 타입을 구분한다.
 *
 * 5가지 체인 타입:
 * - "cosmos"    — 순수 Cosmos 체인 (cosmos 모듈만)
 * - "ethermint" — Cosmos + EVM 하이브리드 (cosmos, evm 모듈 동시 보유)
 * - "evm"       — 순수 EVM 체인 (eip155:* chainId, cosmos 모듈 없음)
 * - "starknet"  — Starknet 체인
 * - "bitcoin"   — Bitcoin 체인
 *
 * 타입 내로잉은 런타임 체크를 통해서만 동작한다:
 *   if (t.type === "evm") { t.embedded.evm; }
 *   switch (t.unwrapped.type) { case "ethermint": t.unwrapped.cosmos; ... }
 */
export interface IModularChainInfoImpl<
  T extends ModularChainInfoTypeNames = ModularChainInfoTypeNames
> {
  readonly type: T;
  readonly chainId: string;
  readonly chainIdentifier: string;
  readonly chainName: string;
  readonly chainSymbolImageUrl?: string;
  readonly isTestnet?: boolean;
  readonly hideInUI?: boolean;
  readonly linkedChainKey?: string;
  /** 원본 체인 정보. registeredCurrencies가 반영되지 않은 상태. */
  readonly embedded: ModularChainInfoByType<T>;
  /** 동적으로 등록된 데이터가 병합된 체인 정보. 현재는 registeredCurrencies만 반영. */
  readonly unwrapped: ModularChainInfoByType<T>;

  /** 모든 모듈의 currency를 합친 flat 배열. v1 ChainInfo.currencies 대응. */
  readonly currencies: AppCurrency[];

  hasFeature(feature: string): boolean;

  addUnknownDenoms(...coinMinimalDenoms: string[]): void;
  addUnknownDenomsWithoutReaction(...coinMinimalDenoms: string[]): void;
  findCurrency(coinMinimalDenom: string): AppCurrency | undefined;
  findCurrencyWithoutReaction(
    coinMinimalDenom: string
  ): AppCurrency | undefined;
  findCurrencyAsync(coinMinimalDenom: string): Promise<AppCurrency | undefined>;
  forceFindCurrency(coinMinimalDenom: string): AppCurrency;
  forceFindCurrencyWithoutReaction(coinMinimalDenom: string): AppCurrency;
  removeCurrencies(...coinMinimalDenoms: string[]): void;
  addCurrencies(...currencies: AppCurrency[]): void;
  isCurrencyRegistrationInProgress(coinMinimalDenom: string): boolean;
}

/**
 * IModularChainInfoImpl의 MobX observable 구현체.
 *
 * ModularChainInfo를 받아서 내부적으로 저장한다.
 * v1과 독립적인 currency 등록/조회 시스템을 갖고 있으며, registeredCurrencies는
 * unwrapModularChainInfo()를 통해 모듈별로 분배된다:
 * - cosmos: native, IBC, cw20, secret20 (erc20 제외)
 * - evm: erc20 토큰
 * - starknet: erc20 토큰
 * - bitcoin: 그대로 유지
 */
export class ModularChainInfoImpl<
  T extends ModularChainInfoTypeNames = ModularChainInfoTypeNames
> implements IModularChainInfoImpl<T>
{
  @observable.ref
  protected _embedded: ModularChainInfo;

  @observable.shallow
  protected unknownDenoms: {
    denom: string;
    reaction: boolean;
  }[] = [];

  @observable.shallow
  protected registeredCurrencies: AppCurrency[] = [];
  @observable.shallow
  protected registeredCurrenciesNoReaction: AppCurrency[] = [];

  @observable.shallow
  protected registrationInProgressCurrencyMap: Map<string, boolean> = new Map();

  protected forceFindCurrencyCache: Map<string, AppCurrency> = new Map();

  constructor(
    modularChainInfo: ModularChainInfo,
    protected readonly currencyRegistry: {
      getCurrencyRegistrar: CurrencyRegistrar;
    }
  ) {
    this._embedded = modularChainInfo;

    makeObservable(this);

    keepAlive(this, "currencyMap");
    keepAlive(this, "unknownDenomMap");
  }

  get type(): T {
    return this._embedded.type as T;
  }

  get chainId(): string {
    return this._embedded.chainId;
  }

  @computed
  get chainIdentifier(): string {
    return ChainIdHelper.parse(this._embedded.chainId).identifier;
  }

  get chainName(): string {
    return this._embedded.chainName;
  }

  get chainSymbolImageUrl(): string | undefined {
    return this._embedded.chainSymbolImageUrl;
  }

  get isTestnet(): boolean | undefined {
    return this._embedded.isTestnet;
  }

  get hideInUI(): boolean | undefined {
    return this._embedded.hideInUI;
  }

  get linkedChainKey(): string | undefined {
    return this._embedded.linkedChainKey;
  }

  get embedded(): ModularChainInfoByType<T> {
    return this._embedded as ModularChainInfoByType<T>;
  }

  @computed
  get unwrapped(): ModularChainInfoByType<T> {
    return unwrapModularChainInfo(
      this._embedded,
      this.registeredCurrencies
    ) as ModularChainInfoByType<T>;
  }

  @computed
  get currencies(): AppCurrency[] {
    const u = this.unwrapped as ModularChainInfo;
    switch (u.type) {
      case "cosmos":
        return u.cosmos.currencies;
      case "ethermint":
        // cosmos.currencies already includes native; evm.tokens has erc20 only
        return [...u.cosmos.currencies, ...u.evm.tokens];
      case "evm":
        return [u.evm.nativeCurrency, ...u.evm.tokens];
      case "starknet":
        return u.starknet.currencies;
      case "bitcoin":
        return u.bitcoin.currencies;
    }
  }

  hasFeature(feature: string): boolean {
    const u = this.unwrapped as ModularChainInfo;
    switch (u.type) {
      case "cosmos":
        return u.cosmos.features?.includes(feature) ?? false;
      case "ethermint":
        return (
          (u.cosmos.features?.includes(feature) ?? false) ||
          (u.evm.features?.includes(feature) ?? false)
        );
      case "evm":
        return u.evm.features?.includes(feature) ?? false;
      case "starknet":
      case "bitcoin":
        return false;
    }
  }

  @action
  addCurrencies(...currencies: AppCurrency[]) {
    if (currencies.length === 0) {
      return;
    }

    const currencyMap = this.currencyMap;
    for (const currency of currencies) {
      const normalizedCoinMinimalDenom = DenomHelper.normalizeDenom(
        currency.coinMinimalDenom
      );
      if (!currencyMap.has(normalizedCoinMinimalDenom)) {
        this.registeredCurrencies.push({
          ...currency,
          coinMinimalDenom: normalizedCoinMinimalDenom,
        });
        this.registeredCurrencies = this.registeredCurrencies.slice();
      }
    }
  }

  @action
  removeCurrencies(...coinMinimalDenoms: string[]) {
    if (coinMinimalDenoms.length === 0) {
      return;
    }

    const map = new Map<string, boolean>();
    for (const coinMinimalDenom of coinMinimalDenoms) {
      const normalizedCoinMinimalDenom =
        DenomHelper.normalizeDenom(coinMinimalDenom);
      map.set(normalizedCoinMinimalDenom, true);
    }

    this.registeredCurrencies = this.registeredCurrencies.filter(
      (currency) =>
        !map.get(DenomHelper.normalizeDenom(currency.coinMinimalDenom))
    );
  }

  /**
   * Currency를 반환한다.
   * 해당 Currency가 없다면 unknown denom에 추가하여 CurrencyRegistrar를 통해 비동기 등록을 시도한다.
   * MobX reaction을 트리거하므로, reaction이 필요 없는 경우 findCurrencyWithoutReaction()을 사용.
   */
  findCurrency(coinMinimalDenom: string): AppCurrency | undefined {
    const normalizedCoinMinimalDenom =
      DenomHelper.normalizeDenom(coinMinimalDenom);
    if (this.currencyMap.has(normalizedCoinMinimalDenom)) {
      return this.currencyMap.get(normalizedCoinMinimalDenom);
    }
    if (this.currencyNoReactionMap.has(normalizedCoinMinimalDenom)) {
      this.moveNoReactionCurrencyToReaction(normalizedCoinMinimalDenom);
      return this.currencyNoReactionMap.get(normalizedCoinMinimalDenom);
    }
    this.addUnknownDenoms(normalizedCoinMinimalDenom);

    // Unknown denom can be registered synchronously in some cases.
    // For this case, re-try to get currency.
    if (this.currencyMap.has(normalizedCoinMinimalDenom)) {
      return this.currencyMap.get(normalizedCoinMinimalDenom);
    }
    if (this.currencyNoReactionMap.has(normalizedCoinMinimalDenom)) {
      this.moveNoReactionCurrencyToReaction(normalizedCoinMinimalDenom);
      return this.currencyNoReactionMap.get(normalizedCoinMinimalDenom);
    }
  }

  findCurrencyWithoutReaction(
    coinMinimalDenom: string
  ): AppCurrency | undefined {
    const normalizedCoinMinimalDenom =
      DenomHelper.normalizeDenom(coinMinimalDenom);
    if (this.currencyMap.has(normalizedCoinMinimalDenom)) {
      return this.currencyMap.get(normalizedCoinMinimalDenom);
    }
    if (this.currencyNoReactionMap.has(normalizedCoinMinimalDenom)) {
      return this.currencyNoReactionMap.get(normalizedCoinMinimalDenom);
    }
    this.addUnknownDenomsWithoutReaction(normalizedCoinMinimalDenom);

    // Unknown denom can be registered synchronously in some cases.
    // For this case, re-try to get currency.
    if (this.currencyMap.has(normalizedCoinMinimalDenom)) {
      return this.currencyMap.get(normalizedCoinMinimalDenom);
    }
    if (this.currencyNoReactionMap.has(normalizedCoinMinimalDenom)) {
      return this.currencyNoReactionMap.get(normalizedCoinMinimalDenom);
    }
  }

  findCurrencyAsync(
    coinMinimalDenom: string
  ): Promise<AppCurrency | undefined> {
    const normalizedCoinMinimalDenom =
      DenomHelper.normalizeDenom(coinMinimalDenom);
    if (this.currencyMap.has(normalizedCoinMinimalDenom)) {
      return Promise.resolve(this.currencyMap.get(normalizedCoinMinimalDenom));
    }
    this.addUnknownDenoms(normalizedCoinMinimalDenom);

    let disposal: IReactionDisposer | undefined;

    return new Promise<AppCurrency | undefined>((resolve) => {
      disposal = autorun(() => {
        const registration = this.registrationInProgressCurrencyMap.get(
          normalizedCoinMinimalDenom
        );
        if (!registration) {
          resolve(this.currencyMap.get(normalizedCoinMinimalDenom));
        }
      });
    }).finally(() => {
      if (disposal) {
        disposal();
      }
    });
  }

  /**
   * findCurrency와 비슷하지만 해당하는 currency가 없을 경우 coinMinimalDenom만으로
   * 구성된 raw currency를 반환한다. undefined를 반환하지 않으므로 UI에서 안전하게 사용 가능.
   * 동일 denom에 대해 같은 ref를 유지하기 위해 내부 cache를 사용한다.
   */
  forceFindCurrency(coinMinimalDenom: string): AppCurrency {
    const normalizedCoinMinimalDenom =
      DenomHelper.normalizeDenom(coinMinimalDenom);
    const currency = this.findCurrency(normalizedCoinMinimalDenom);
    if (!currency) {
      // ref을 유지하기 위해서 cache를 사용한다.
      if (this.forceFindCurrencyCache.has(normalizedCoinMinimalDenom)) {
        return this.forceFindCurrencyCache.get(normalizedCoinMinimalDenom)!;
      }
      const cur = {
        coinMinimalDenom: normalizedCoinMinimalDenom,
        coinDenom: normalizedCoinMinimalDenom,
        coinDecimals: 0,
      };
      this.forceFindCurrencyCache.set(normalizedCoinMinimalDenom, cur);
      return cur;
    }
    return currency;
  }

  forceFindCurrencyWithoutReaction(coinMinimalDenom: string): AppCurrency {
    const normalizedCoinMinimalDenom =
      DenomHelper.normalizeDenom(coinMinimalDenom);
    const currency = this.findCurrencyWithoutReaction(
      normalizedCoinMinimalDenom
    );
    if (!currency) {
      // ref을 유지하기 위해서 cache를 사용한다.
      if (this.forceFindCurrencyCache.has(normalizedCoinMinimalDenom)) {
        return this.forceFindCurrencyCache.get(normalizedCoinMinimalDenom)!;
      }
      const cur = {
        coinMinimalDenom: normalizedCoinMinimalDenom,
        coinDenom: normalizedCoinMinimalDenom,
        coinDecimals: 0,
      };
      this.forceFindCurrencyCache.set(normalizedCoinMinimalDenom, cur);
      return cur;
    }
    return currency;
  }

  isCurrencyRegistrationInProgress(coinMinimalDenom: string): boolean {
    return (
      this.registrationInProgressCurrencyMap.get(coinMinimalDenom) || false
    );
  }

  addUnknownDenoms(...coinMinimalDenoms: string[]) {
    this.addUnknownDenomsImpl(coinMinimalDenoms, true);
  }

  addUnknownDenomsWithoutReaction(...coinMinimalDenoms: string[]) {
    this.addUnknownDenomsImpl(coinMinimalDenoms, false);
  }

  /**
   * unknown denom을 등록하고 CurrencyRegistrar를 통해 currency 정보를 비동기로 resolve한다.
   * reaction=true이면 resolve된 currency가 MobX reaction을 트리거하고,
   * false이면 트리거하지 않다가 findCurrency()로 접근 시 reaction 쪽으로 이동된다.
   */
  protected addUnknownDenomsImpl(
    coinMinimalDenoms: string[],
    reaction: boolean
  ) {
    for (const coinMinimalDenom of coinMinimalDenoms) {
      const normalizedCoinMinimalDenom =
        DenomHelper.normalizeDenom(coinMinimalDenom);
      let found = false;
      const prior = this.unknownDenomMap.get(normalizedCoinMinimalDenom);
      if (prior) {
        if (prior.reaction === reaction) {
          continue;
        } else if (reaction) {
          found = true;
          // 로직상 reaction은 reactive할 필요가 없기 때문에
          // 그냥 여기서 바꾼다.
          prior.reaction = reaction;
        }
      }

      if (this.currencyMap.has(normalizedCoinMinimalDenom)) {
        continue;
      }

      if (this.currencyNoReactionMap.has(normalizedCoinMinimalDenom)) {
        continue;
      }

      if (!found) {
        runInAction(() => {
          this.unknownDenoms.push({
            denom: normalizedCoinMinimalDenom,
            reaction,
          });
          this.unknownDenoms = this.unknownDenoms.slice();
          this.registrationInProgressCurrencyMap.set(
            normalizedCoinMinimalDenom,
            true
          );
        });
      }

      let i = 0;
      let disposed = false;
      const disposer = autorun(() => {
        i++;
        const dispose = () => {
          disposed = true;

          if (i === 1) {
            setTimeout(() => {
              if (disposer) {
                disposer();
              }
            }, 1);
          } else {
            if (disposer) {
              disposer();
            }
          }
        };

        if (disposed) {
          return;
        }

        const generator = this.currencyRegistry.getCurrencyRegistrar(
          this.chainId,
          normalizedCoinMinimalDenom
        );
        if (generator) {
          const currency = generator.value;
          runInAction(() => {
            if (!generator.done) {
              this.registrationInProgressCurrencyMap.set(
                normalizedCoinMinimalDenom,
                true
              );
            }

            if (currency) {
              const index = this.unknownDenoms.findIndex(
                (denom) => denom.denom === normalizedCoinMinimalDenom
              );
              let prev:
                | {
                    denom: string;
                    reaction: boolean;
                  }
                | undefined;
              if (index >= 0) {
                prev = this.unknownDenoms[index];
                if (generator.done) {
                  this.unknownDenoms.splice(index, 1);
                  this.unknownDenoms = this.unknownDenoms.slice();
                }
              }

              if (!prev || prev.reaction) {
                this.addOrReplaceCurrency(currency);
              } else {
                this.addOrReplaceCurrencyNoReaction(currency);
              }
            }

            if (generator.done) {
              this.registrationInProgressCurrencyMap.delete(
                normalizedCoinMinimalDenom
              );
            }
          });

          if (generator.done) {
            dispose();
          }
        } else {
          if (
            this.registrationInProgressCurrencyMap.get(
              normalizedCoinMinimalDenom
            )
          ) {
            runInAction(() => {
              this.registrationInProgressCurrencyMap.delete(
                normalizedCoinMinimalDenom
              );
            });
          }

          dispose();
        }
      });
    }
  }

  /** noReaction 목록에서 reaction 목록으로 currency를 이동한다. findCurrency() 호출 시 자동 수행. */
  @action
  protected moveNoReactionCurrencyToReaction(coinMinimalDenom: string) {
    const index = this.registeredCurrenciesNoReaction.findIndex(
      (cur) => cur.coinMinimalDenom === coinMinimalDenom
    );
    if (index >= 0) {
      const currency = this.registeredCurrenciesNoReaction[index];
      this.registeredCurrenciesNoReaction.splice(index, 1);
      this.registeredCurrenciesNoReaction =
        this.registeredCurrenciesNoReaction.slice();
      this.registeredCurrencies.push(currency);
      this.registeredCurrencies = this.registeredCurrencies.slice();
    }
  }

  @computed
  protected get unknownDenomMap(): Map<
    string,
    { denom: string; reaction: boolean }
  > {
    const result: Map<
      string,
      {
        denom: string;
        reaction: boolean;
      }
    > = new Map();
    for (const denom of this.unknownDenoms) {
      result.set(denom.denom, denom);
    }
    return result;
  }

  @action
  protected addOrReplaceCurrency(currency: AppCurrency) {
    const normalizedCoinMinimalDenom = DenomHelper.normalizeDenom(
      currency.coinMinimalDenom
    );
    if (this.currencyMap.has(normalizedCoinMinimalDenom)) {
      const index = this.registeredCurrencies.findIndex(
        (cur) => cur.coinMinimalDenom === normalizedCoinMinimalDenom
      );
      if (index >= 0) {
        const prev = this.registeredCurrencies[index];
        if (
          // If same, do nothing
          sortedJsonByKeyStringify(prev) !== sortedJsonByKeyStringify(currency)
        ) {
          this.registeredCurrencies.splice(index, 1, currency);
          this.registeredCurrencies = this.registeredCurrencies.slice();
        }
      }
    } else {
      this.registeredCurrencies.push(currency);
      this.registeredCurrencies = this.registeredCurrencies.slice();
    }
  }

  @action
  protected addOrReplaceCurrencyNoReaction(currency: AppCurrency) {
    const normalizedCoinMinimalDenom = DenomHelper.normalizeDenom(
      currency.coinMinimalDenom
    );
    if (this.currencyNoReactionMap.has(normalizedCoinMinimalDenom)) {
      const index = this.registeredCurrenciesNoReaction.findIndex(
        (cur) => cur.coinMinimalDenom === normalizedCoinMinimalDenom
      );
      if (index >= 0) {
        const prev = this.registeredCurrenciesNoReaction[index];
        if (
          // If same, do nothing
          sortedJsonByKeyStringify(prev) !== sortedJsonByKeyStringify(currency)
        ) {
          this.registeredCurrenciesNoReaction.splice(index, 1, currency);
          this.registeredCurrenciesNoReaction =
            this.registeredCurrenciesNoReaction.slice();
        }
      }
    } else {
      this.registeredCurrenciesNoReaction.push(currency);
      this.registeredCurrenciesNoReaction =
        this.registeredCurrenciesNoReaction.slice();
    }
  }

  /** unwrapped(registeredCurrencies 병합 후)에서 전체 currency map을 구축한다. */
  @computed
  protected get currencyMap(): Map<string, AppCurrency> {
    return getCurrencyMapFromModularChainInfo(this.unwrapped);
  }

  @action
  setEmbeddedModularChainInfo(embedded: ModularChainInfo) {
    this._embedded = embedded;

    // 새 embedded에 이미 포함된 currency가 registeredCurrencies에 남아있으면
    // unwrap 시 concat으로 중복이 발생한다.
    // embedded 업데이트 후 겹치는 항목을 제거한다.
    const embeddedCurrencyDenoms = new Set<string>();
    for (const key of getCurrencyMapFromModularChainInfo(embedded).keys()) {
      embeddedCurrencyDenoms.add(DenomHelper.normalizeDenom(key));
    }

    if (embeddedCurrencyDenoms.size > 0) {
      const newRegistered = this.registeredCurrencies.filter(
        (cur) =>
          !embeddedCurrencyDenoms.has(
            DenomHelper.normalizeDenom(cur.coinMinimalDenom)
          )
      );
      if (newRegistered.length !== this.registeredCurrencies.length) {
        this.registeredCurrencies = newRegistered;
      }

      const newRegisteredNoReaction =
        this.registeredCurrenciesNoReaction.filter(
          (cur) =>
            !embeddedCurrencyDenoms.has(
              DenomHelper.normalizeDenom(cur.coinMinimalDenom)
            )
        );
      if (
        newRegisteredNoReaction.length !==
        this.registeredCurrenciesNoReaction.length
      ) {
        this.registeredCurrenciesNoReaction = newRegisteredNoReaction;
      }
    }
  }

  @computed
  protected get currencyNoReactionMap(): Map<string, AppCurrency> {
    const result: Map<string, AppCurrency> = new Map();
    for (const currency of this.registeredCurrenciesNoReaction) {
      result.set(currency.coinMinimalDenom, currency);
    }
    return result;
  }
}
