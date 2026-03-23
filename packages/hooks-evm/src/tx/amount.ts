import {
  IAmountConfig,
  IFeeConfig,
  ISenderConfig,
  UIProperties,
} from "./types";
import { TxChainSetter } from "./chain";
import { ChainGetter } from "@keplr-wallet/stores";
import { action, computed, makeObservable, observable } from "mobx";
import { AppCurrency } from "@keplr-wallet/types";
import {
  EmptyAmountError,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
} from "./errors";
import { CoinPretty, Dec, DecUtils } from "@keplr-wallet/unit";
import { useState } from "react";
import { QueriesStore } from "./internal";

export class AmountConfig extends TxChainSetter implements IAmountConfig {
  @observable.ref
  protected _currency?: AppCurrency = undefined;

  @observable
  protected _value: string = "";

  @observable
  protected _fraction: number = 0;

  @observable.ref
  protected _feeConfig: IFeeConfig | undefined = undefined;

  constructor(
    chainGetter: ChainGetter,
    protected readonly queriesStore: QueriesStore,
    initialChainId: string,
    protected readonly senderConfig: ISenderConfig
  ) {
    super(chainGetter, initialChainId);

    makeObservable(this);
  }

  get feeConfig(): IFeeConfig | undefined {
    return this._feeConfig;
  }

  @action
  setFeeConfig(feeConfig: IFeeConfig | undefined) {
    this._feeConfig = feeConfig;
  }

  @computed
  get value(): string {
    if (this.fraction > 0) {
      let result = this.queriesStore
        .get(this.chainId)
        .queryBalances.getQueryEthereumHexAddress(this.senderConfig.sender)
        .getBalance(this.currency)?.balance;
      if (!result) {
        return "0";
      }
      if (this.feeConfig && this.feeConfig.maxFee) {
        if (
          this.currency.coinMinimalDenom ===
          this.feeConfig.maxFee.currency.coinMinimalDenom
        ) {
          result = result.sub(this.feeConfig.maxFee);
        }
      }
      if (result.toDec().lte(new Dec(0))) {
        return "0";
      }

      return result
        .mul(new Dec(this.fraction))
        .trim(true)
        .locale(false)
        .hideDenom(true)
        .toString();
    }

    return this._value;
  }

  @action
  setValue(value: string): void {
    if (value.startsWith(".")) {
      value = "0" + value;
    }

    this._value = value;

    this.setFraction(0);
  }

  @computed
  get amount(): CoinPretty[] {
    let amount: Dec;
    try {
      if (this.value.trim() === "") {
        amount = new Dec(0);
      } else {
        amount = new Dec(this.value);
      }
    } catch {
      amount = new Dec(0);
    }

    try {
      return [
        new CoinPretty(
          this.currency,
          amount
            .mul(DecUtils.getTenExponentN(this.currency.coinDecimals))
            .truncate()
        ),
      ];
    } catch {
      return [new CoinPretty(this.currency, new Dec(0))];
    }
  }

  @computed
  get currency(): AppCurrency {
    const u = this.modularChainInfo.unwrapped;
    if (u.type !== "evm" && u.type !== "ethermint") {
      throw new Error("Chain is not an EVM compatible chain");
    }

    if (this._currency) {
      const allCurrencies: AppCurrency[] = [
        u.evm.nativeCurrency,
        ...(u.evm.tokens ?? []),
      ];
      const find = allCurrencies.find(
        (cur) => cur.coinMinimalDenom === this._currency!.coinMinimalDenom
      );
      if (find) {
        return find;
      }
    }

    return u.evm.nativeCurrency;
  }

  @action
  setCurrency(currency: AppCurrency | undefined) {
    if (currency?.coinMinimalDenom !== this._currency?.coinMinimalDenom) {
      this._value = "";
      this.setFraction(0);
    }

    this._currency = currency;
  }

  get fraction(): number {
    return this._fraction;
  }

  @action
  setFraction(fraction: number): void {
    this._fraction = fraction;
  }

  canUseCurrency(currency: AppCurrency): boolean {
    const u = this.modularChainInfo.unwrapped;
    if (u.type !== "evm" && u.type !== "ethermint") {
      return false;
    }

    const allCurrencies: AppCurrency[] = [
      u.evm.nativeCurrency,
      ...(u.evm.tokens ?? []),
    ];

    return (
      allCurrencies.find(
        (cur) => cur.coinMinimalDenom === currency.coinMinimalDenom
      ) != null
    );
  }

  @computed
  get uiProperties(): UIProperties {
    if (!this.currency) {
      return {
        error: new Error("Currency to send not set"),
      };
    }

    if (this.value.trim() === "") {
      return {
        error: new EmptyAmountError("Amount is empty"),
      };
    }

    try {
      const dec = new Dec(this.value);
      if (dec.equals(new Dec(0))) {
        return {
          error: new ZeroAmountError("Amount is zero"),
        };
      }
      if (dec.lt(new Dec(0))) {
        return {
          error: new NegativeAmountError("Enter a positive number"),
        };
      }

      new CoinPretty(
        this.currency,
        dec.mul(DecUtils.getTenExponentN(this.currency.coinDecimals)).truncate()
      );
    } catch {
      return {
        error: new InvalidNumberAmountError("Enter a valid number"),
      };
    }

    for (const amount of this.amount) {
      const bal = this.queriesStore
        .get(this.chainId)
        .queryBalances.getQueryEthereumHexAddress(this.senderConfig.sender)
        .getBalance(amount.currency);

      if (!bal) {
        return {
          warning: new Error(
            `Can't parse the balance for ${amount.currency.coinMinimalDenom}`
          ),
        };
      }

      if (bal.error) {
        return {
          warning: new Error("Failed to fetch balance"),
        };
      }

      if (!bal.response) {
        return {
          loadingState: "loading-block",
        };
      }

      if (bal.balance.toDec().lt(amount.toDec())) {
        return {
          error: new InsufficientAmountError("Insufficient balance"),
          loadingState: bal.isFetching ? "loading" : undefined,
        };
      }
    }

    return {};
  }
}

export const useAmountConfig = (
  chainGetter: ChainGetter,
  queriesStore: QueriesStore,
  chainId: string,
  senderConfig: ISenderConfig
) => {
  const [txConfig] = useState(
    () => new AmountConfig(chainGetter, queriesStore, chainId, senderConfig)
  );
  txConfig.setChain(chainId);

  return txConfig;
};
