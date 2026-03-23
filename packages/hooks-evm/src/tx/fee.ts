import {
  EVMFeeType,
  IAmountConfig,
  IFeeConfig,
  IGasConfig,
  ISenderConfig,
  UIProperties,
} from "./types";
import { TxChainSetter } from "./chain";
import { ChainGetter } from "@keplr-wallet/stores";
import { action, computed, makeObservable, observable } from "mobx";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { useState } from "react";
import { QueriesStore } from "./internal";
import { InsufficientFeeError } from "./errors";
import { computedFn } from "mobx-utils";
import { EthereumQueriesImpl } from "@keplr-wallet/stores-eth";
import {
  calculateOptimalMaxPriorityFeePerGas,
  computeEIP1559TxFees,
  ETH_FEE_HISTORY_BLOCK_COUNT,
  ETH_FEE_HISTORY_NEWEST_BLOCK,
  ETH_FEE_HISTORY_REWARD_PERCENTILES,
  getEIP1559QueryUIState,
  getL1DataFeeToAdd,
  GWEI,
} from "./evm-fee-utils";

export class FeeConfig extends TxChainSetter implements IFeeConfig {
  @observable
  protected _type: EVMFeeType = "average";

  @observable
  protected _customPriorityFee: string = "";

  @observable
  protected _customPriorityFeeInput: string = "";

  @observable
  protected _customGasPrice: string = "";

  @observable
  protected _customGasPriceInput: string = "";

  @observable
  protected _forceLegacyFeeMode: boolean | undefined = undefined;

  @observable
  protected _disableBalanceCheck: boolean = false;

  @observable
  protected additionAmountToNeedFee: boolean = true;

  @observable
  protected _l1DataFee: Dec | undefined = undefined;

  constructor(
    chainGetter: ChainGetter,
    protected readonly queriesStore: QueriesStore,
    initialChainId: string,
    protected readonly senderConfig: ISenderConfig,
    protected readonly amountConfig: IAmountConfig,
    protected readonly gasConfig: IGasConfig,
    additionAmountToNeedFee: boolean = true
  ) {
    super(chainGetter, initialChainId);

    this.additionAmountToNeedFee = additionAmountToNeedFee;
    makeObservable(this);
  }

  @action
  setAdditionAmountToNeedFee(additionAmountToNeedFee: boolean) {
    this.additionAmountToNeedFee = additionAmountToNeedFee;
  }

  @action
  setDisableBalanceCheck(bool: boolean) {
    this._disableBalanceCheck = bool;
  }

  get type(): EVMFeeType {
    return this._type;
  }

  @action
  setType(type: EVMFeeType): void {
    if (type === "custom" && this._customPriorityFee === "") {
      const currentFees = this.getEIP1559TxFees(this._type);
      const priorityFee = currentFees.maxPriorityFeePerGas;
      if (priorityFee) {
        this._customPriorityFee = priorityFee.truncate().toString();
        this._customPriorityFeeInput = priorityFee.quo(GWEI).toString(9);
      }

      if (this.isLegacyFeeMode) {
        const fees = this.getEIP1559TxFees("average");
        const currentGasPrice = fees.gasPrice ?? new Dec(0);
        this._customGasPrice = currentGasPrice.truncate().toString();
        this._customGasPriceInput = currentGasPrice.quo(GWEI).toString(9);
      }
    }
    if (type !== "custom") {
      this._forceLegacyFeeMode = undefined;
    }
    this._type = type;
  }

  @action
  setForceLegacyFeeMode(value: boolean | undefined): void {
    this._forceLegacyFeeMode = value;
  }

  get customPriorityFee(): string {
    return this._customPriorityFee;
  }

  get customPriorityFeeInput(): string {
    return this._customPriorityFeeInput;
  }

  @action
  setCustomPriorityFee(gweiValue: string): void {
    if (gweiValue.startsWith(".")) {
      gweiValue = "0" + gweiValue;
    }
    this._customPriorityFeeInput = gweiValue;

    if (gweiValue.trim() === "") {
      this._customPriorityFee = "";
    } else {
      try {
        this._customPriorityFee = new Dec(gweiValue)
          .mul(GWEI)
          .truncate()
          .toString();
      } catch {
        // keep previous value on invalid input
      }
    }
  }

  @computed
  get isLegacyFeeMode(): boolean {
    if (this._forceLegacyFeeMode !== undefined) {
      return this._forceLegacyFeeMode;
    }
    const ethereumQueries = this.getEthereumQueries();
    if (!ethereumQueries || !this.canEIP1559TxFeesAndReady()) {
      return false;
    }
    const block = ethereumQueries.queryEthereumBlock.getQueryByBlockNumberOrTag(
      ETH_FEE_HISTORY_NEWEST_BLOCK
    ).block;
    if (!block || block.baseFeePerGas == null) {
      return false;
    }
    return parseInt(block.baseFeePerGas) === 0;
  }

  get customGasPrice(): string {
    return this._customGasPrice;
  }

  get customGasPriceInput(): string {
    return this._customGasPriceInput;
  }

  @action
  setCustomGasPrice(gweiValue: string): void {
    if (gweiValue.startsWith(".")) {
      gweiValue = "0" + gweiValue;
    }
    this._customGasPriceInput = gweiValue;

    if (gweiValue.trim() === "") {
      this._customGasPrice = "";
    } else {
      try {
        this._customGasPrice = new Dec(gweiValue)
          .mul(GWEI)
          .truncate()
          .toString();
      } catch {
        // keep previous value on invalid input
      }
    }
  }

  protected get currentPriorityFee(): Dec {
    const ethereumQueries = this.queriesStore.get(this.chainId).ethereum;
    if (!ethereumQueries || !this.canEIP1559TxFeesAndReady()) {
      return new Dec(0);
    }

    const feeType = this.type === "custom" ? "average" : this.type;
    const priorityFee = calculateOptimalMaxPriorityFeePerGas(
      ethereumQueries,
      feeType,
      this.chainId
    );

    return priorityFee;
  }

  get l1DataFee(): Dec | undefined {
    return this._l1DataFee;
  }

  @action
  setL1DataFee(fee: Dec) {
    this._l1DataFee = fee;
  }

  protected getEthereumQueries(): EthereumQueriesImpl | undefined {
    return this.queriesStore.get(this.chainId).ethereum;
  }

  protected canEIP1559TxFeesAndReady(isRefresh?: boolean): boolean {
    if (!this.senderConfig.sender.startsWith("0x")) {
      return false;
    }

    const ethereumQueries = this.getEthereumQueries();
    if (!ethereumQueries) {
      return false;
    }

    const blockQuery =
      ethereumQueries.queryEthereumBlock.getQueryByBlockNumberOrTag(
        ETH_FEE_HISTORY_NEWEST_BLOCK
      );
    if (blockQuery.block != null) {
      if (isRefresh) {
        blockQuery.waitFreshResponse();
      }

      const feeHistoryQuery =
        ethereumQueries.queryEthereumFeeHistory.getQueryByFeeHistoryParams(
          ETH_FEE_HISTORY_BLOCK_COUNT,
          ETH_FEE_HISTORY_NEWEST_BLOCK,
          ETH_FEE_HISTORY_REWARD_PERCENTILES
        );
      if (feeHistoryQuery.feeHistory != null) {
        if (isRefresh) {
          feeHistoryQuery.waitFreshResponse();
        }
      }

      const maxPriorityFeePerGasQuery =
        ethereumQueries.queryEthereumMaxPriorityFee;
      if (maxPriorityFeePerGasQuery.maxPriorityFeePerGas != null) {
        if (isRefresh) {
          maxPriorityFeePerGasQuery.waitFreshResponse();
        }
      }

      return true;
    }

    const gasPriceQuery = ethereumQueries.queryEthereumGasPrice;
    if (gasPriceQuery.gasPrice != null) {
      if (isRefresh) {
        gasPriceQuery.waitFreshResponse();
      }

      return true;
    }

    return false;
  }

  refreshEIP1559TxFees() {
    this.canEIP1559TxFeesAndReady(true);
  }

  readonly getEIP1559TxFees = computedFn(
    (feeTypeOrManual: EVMFeeType | "manual") => {
      const isCustom = feeTypeOrManual === "custom";
      const feeType =
        feeTypeOrManual === "manual" || feeTypeOrManual === "custom"
          ? "average"
          : feeTypeOrManual;

      const ethereumQueries = this.getEthereumQueries();
      if (ethereumQueries && this.canEIP1559TxFeesAndReady()) {
        if (feeTypeOrManual === "custom") {
          // Legacy mode: use custom gas price if available
          if (this.isLegacyFeeMode) {
            if (isCustom && this._customGasPrice.trim() !== "") {
              try {
                return { gasPrice: new Dec(this._customGasPrice) };
              } catch {
                // fall through to default
              }
            } else {
              return computeEIP1559TxFees(
                ethereumQueries,
                feeType,
                this.chainId
              );
            }
          }
          // EIP-1559 mode: use custom priority fee
          if (isCustom && this._customPriorityFee.trim() !== "") {
            try {
              const customWei = new Dec(this._customPriorityFee);
              // 여기서 feeType이 average인 이유는 customWei값이 존재 하면 실제로 계산 하지 않고 설정된 값으로 전달이 되기 때문에
              // fallback feeType이다.
              return computeEIP1559TxFees(
                ethereumQueries,
                "average",
                this.chainId,
                customWei
              );
            } catch {
              // fall through to default
            }
          }
          return computeEIP1559TxFees(ethereumQueries, "average", this.chainId);
        }

        return computeEIP1559TxFees(ethereumQueries, feeType, this.chainId);
      }

      return {
        gasPrice: new Dec(0),
      };
    }
  );

  protected getFeeCurrency(): AppCurrency {
    const u = this.modularChainInfo.unwrapped;
    if (u.type !== "evm" && u.type !== "ethermint") {
      throw new Error("Chain is not an EVM chain");
    }
    return u.evm.nativeCurrency;
  }

  @computed
  get maxFeePerGas(): Dec | undefined {
    const fees = this.getEIP1559TxFees(this.type);
    return fees.maxFeePerGas;
  }

  @computed
  get maxPriorityFeePerGas(): Dec | undefined {
    const fees = this.getEIP1559TxFees(this.type);
    return fees.maxPriorityFeePerGas;
  }

  @computed
  get gasPrice(): Dec | undefined {
    const fees = this.getEIP1559TxFees(this.type);
    return fees.gasPrice ?? fees.maxFeePerGas;
  }

  protected getL1DataFeeToAdd(): Dec {
    return getL1DataFeeToAdd(
      this.modularChainInfo.hasFeature("op-stack-l1-data-fee"),
      this._l1DataFee
    );
  }

  @computed
  get fee(): CoinPretty | undefined {
    const price = this.gasPrice;
    if (!price || price.equals(new Dec(0))) {
      return undefined;
    }

    const feeCurrency = this.getFeeCurrency();
    const gasDec = new Dec(this.gasConfig.gas);
    const l1DataFeeToAdd = this.getL1DataFeeToAdd();
    return new CoinPretty(
      feeCurrency,
      price.mul(gasDec).add(l1DataFeeToAdd).roundUp()
    );
  }

  @computed
  get maxFee(): CoinPretty | undefined {
    const price = this.gasPrice;
    if (!price || price.equals(new Dec(0))) {
      return undefined;
    }

    const feeCurrency = this.getFeeCurrency();
    const gasDec = new Dec(this.gasConfig.gas);
    const l1DataFeeToAdd = this.getL1DataFeeToAdd();
    // For maxFee, use a higher multiplier to be safe
    return new CoinPretty(
      feeCurrency,
      price.mul(new Dec(1.2)).mul(gasDec).add(l1DataFeeToAdd).roundUp()
    );
  }

  // --- hooks IFeeConfig 구조 호환용 ---

  @computed
  get fees(): CoinPretty[] {
    return this.fee ? [this.fee] : [];
  }

  @computed
  get selectableFeeCurrencies(): FeeCurrency[] {
    return [this.getFeeCurrency()];
  }

  @action
  setFee(
    fee:
      | { type: EVMFeeType; currency: FeeCurrency }
      | CoinPretty
      | CoinPretty[]
      | undefined
  ): void {
    if (!fee) {
      return;
    }
    if ("type" in fee && "currency" in fee) {
      this.setType(fee.type);
    }
  }

  readonly getFeeTypePrettyForFeeCurrency = computedFn(
    (_currency: FeeCurrency, feeType: EVMFeeType): CoinPretty => {
      const fees = this.getEIP1559TxFees(feeType);
      const price = fees.gasPrice ?? fees.maxFeePerGas ?? new Dec(0);
      const feeCurrency = this.getFeeCurrency();
      const gasDec = new Dec(this.gasConfig.gas);
      const l1DataFeeToAdd = this.getL1DataFeeToAdd();
      return new CoinPretty(
        feeCurrency,
        price.mul(gasDec).add(l1DataFeeToAdd).roundUp()
      );
    }
  );

  toStdFee(): StdFee {
    const fee = this.fee;
    if (!fee) {
      return { gas: "0", amount: [] };
    }
    return {
      gas: this.gasConfig.gas.toString(),
      amount: [fee.toCoin()],
    };
  }

  // --- end hooks IFeeConfig 구조 호환용 ---

  @computed
  get uiProperties(): UIProperties {
    if (this._disableBalanceCheck) {
      return {};
    }

    if (!this.canEIP1559TxFeesAndReady()) {
      return {
        loadingState: "loading-block",
      };
    }

    if (this._type === "custom") {
      const rawValue = this.isLegacyFeeMode
        ? this._customGasPrice
        : this._customPriorityFee;
      if (rawValue.trim() !== "") {
        try {
          const dec = new Dec(rawValue);
          if (dec.lt(new Dec(0))) {
            return {
              error: new Error("Enter a positive number"),
            };
          }
        } catch {
          return {
            error: new Error("Enter a valid number"),
          };
        }
      }
    }

    let priorWarning: Error | undefined = undefined;
    let priorIsLoadingState = false;
    const makeReturn = (uiProperties: UIProperties): UIProperties => {
      return {
        ...uiProperties,
        ...(() => {
          if (priorIsLoadingState) {
            if (uiProperties.loadingState === "loading-block") {
              return {
                loadingState: "loading-block" as const,
              };
            } else {
              return {
                loadingState: "loading" as const,
              };
            }
          }
          return {};
        })(),
        ...(() => {
          if (priorWarning) {
            if (uiProperties.error) {
              return {};
            } else {
              return {
                warning: priorWarning,
              };
            }
          }
          return {};
        })(),
      };
    };

    const ethereumQueries = this.getEthereumQueries();
    if (ethereumQueries) {
      const eipState = getEIP1559QueryUIState(ethereumQueries, this.chainId);
      if (eipState.warning) {
        priorWarning = eipState.warning;
      }
      if (eipState.isLoading) {
        priorIsLoadingState = true;
      }
      if (eipState.isBlocked) {
        return makeReturn({
          loadingState: "loading-block",
        });
      }
    }

    const fee = this.fee;
    if (!fee) {
      return makeReturn({
        error: new Error("Fee is not set"),
        loadingState: "loading-block",
      });
    }

    const feeCurrency = this.getFeeCurrency();
    let needAmount = new Int(fee.toCoin().amount);

    if (this.additionAmountToNeedFee) {
      for (const amt of this.amountConfig.amount) {
        if (amt.currency.coinMinimalDenom === feeCurrency.coinMinimalDenom) {
          needAmount = needAmount.add(new Int(amt.toCoin().amount));
        }
      }
    }

    const bal = this.queriesStore
      .get(this.chainId)
      .queryBalances.getQueryEthereumHexAddress(this.senderConfig.sender)
      .getBalance(feeCurrency);

    if (!bal) {
      priorWarning = new Error(
        `Can't parse the balance for ${feeCurrency.coinMinimalDenom}`
      );
    }

    if (bal) {
      bal.waitResponse();

      if (bal.error) {
        priorWarning = new Error("Failed to fetch balance");
      }

      if (!bal.response) {
        return makeReturn({
          loadingState: "loading-block",
        });
      }

      if (new Int(bal.balance.toCoin().amount).lt(needAmount)) {
        if (bal.isFetching) {
          priorIsLoadingState = true;
        }

        return makeReturn({
          error: new InsufficientFeeError("Insufficient fee"),
        });
      }
    }

    return makeReturn({});
  }
}

import { AppCurrency, FeeCurrency, StdFee } from "@keplr-wallet/types";

export const useFeeConfig = (
  chainGetter: ChainGetter,
  queriesStore: QueriesStore,
  chainId: string,
  senderConfig: ISenderConfig,
  amountConfig: IAmountConfig,
  gasConfig: IGasConfig,
  opts: {
    additionAmountToNeedFee?: boolean;
  } = {}
) => {
  const [config] = useState(
    () =>
      new FeeConfig(
        chainGetter,
        queriesStore,
        chainId,
        senderConfig,
        amountConfig,
        gasConfig,
        opts.additionAmountToNeedFee ?? true
      )
  );
  config.setChain(chainId);
  config.setAdditionAmountToNeedFee(opts.additionAmountToNeedFee ?? true);

  return config;
};
