import { IFeeConfig, IGasConfig, IGasSimulator, UIProperties } from "./types";
import {
  action,
  autorun,
  computed,
  IReactionDisposer,
  makeObservable,
  observable,
  runInAction,
} from "mobx";
import { useEffect, useState } from "react";
import { KVStore } from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { TxChainSetter } from "./chain";
import { ChainGetter } from "@keplr-wallet/stores";
import { isSimpleFetchError } from "@keplr-wallet/simple-fetch";
import { EvmGasSimulationOutcome } from "@keplr-wallet/types";
import { CoinPretty } from "@keplr-wallet/unit";

export type SimulateGasFn = () => {
  simulate: () => Promise<{
    gasUsed: number;
    evmSimulationOutcome?: EvmGasSimulationOutcome;
  }>;
};

class GasSimulatorState {
  @observable
  protected _isInitialized: boolean = false;

  @observable
  protected _initialGasEstimated: number | undefined = undefined;

  @observable
  protected _recentGasEstimated: number | undefined = undefined;

  @observable.ref
  protected _recentEvmSimulationOutcome: EvmGasSimulationOutcome | undefined =
    undefined;

  @observable.ref
  protected _simulateFn:
    | (() => Promise<{
        gasUsed: number;
        evmSimulationOutcome?: EvmGasSimulationOutcome;
      }>)
    | undefined = undefined;

  @observable
  protected _isZeroFee: boolean = true;

  @observable.ref
  protected _error: Error | undefined = undefined;

  constructor() {
    makeObservable(this);
  }

  @action
  setIsInitialized(value: boolean) {
    this._isInitialized = value;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  @action
  setInitialGasEstimated(gas: number) {
    this._initialGasEstimated = gas;
  }

  get initialGasEstimated(): number | undefined {
    return this._initialGasEstimated;
  }

  @action
  setRecentGasEstimated(gas: number) {
    this._recentGasEstimated = gas;
  }

  get recentGasEstimated(): number | undefined {
    return this._recentGasEstimated;
  }

  @action
  setRecentEvmSimulationOutcome(outcome: EvmGasSimulationOutcome | undefined) {
    this._recentEvmSimulationOutcome = outcome;
  }

  get recentEvmSimulationOutcome(): EvmGasSimulationOutcome | undefined {
    return this._recentEvmSimulationOutcome;
  }

  @action
  refreshSimulateFn(
    fn: () => Promise<{
      gasUsed: number;
      evmSimulationOutcome?: EvmGasSimulationOutcome;
    }>
  ) {
    this._simulateFn = fn;
  }

  get simulateFn():
    | (() => Promise<{
        gasUsed: number;
        evmSimulationOutcome?: EvmGasSimulationOutcome;
      }>)
    | undefined {
    return this._simulateFn;
  }

  @action
  setError(error: Error | undefined) {
    this._error = error;
  }

  get error(): Error | undefined {
    return this._error;
  }

  get isZeroFee(): boolean {
    return this._isZeroFee;
  }

  @action
  setIsZeroFee(value: boolean) {
    this._isZeroFee = value;
  }

  static isZeroFee(fee: CoinPretty | undefined): boolean {
    if (!fee) {
      return true;
    }
    return fee.toCoin().amount === "0";
  }
}

export class GasSimulator extends TxChainSetter implements IGasSimulator {
  @observable
  protected _key: string;

  @observable
  protected _gasAdjustmentValue: string = "1.3";

  @observable
  protected _enabled: boolean = false;

  @observable
  protected _forceDisabled: boolean = false;
  @observable
  protected _forceDisableReason: Error | undefined = undefined;

  @observable
  protected _isSimulating: boolean = false;

  @observable.shallow
  protected _stateMap: Map<string, GasSimulatorState> = new Map();

  protected _debounceTimeoutId: NodeJS.Timeout | null = null;
  protected readonly _debounceMs: number = 300;

  protected _disposers: IReactionDisposer[] = [];

  constructor(
    protected kvStore: KVStore,
    chainGetter: ChainGetter,
    initialChainId: string,
    protected readonly gasConfig: IGasConfig,
    protected readonly feeConfig: IFeeConfig,
    protected readonly initialKey: string,
    protected simulateGasFn: SimulateGasFn
  ) {
    super(chainGetter, initialChainId);

    this._key = initialKey;

    makeObservable(this);

    this.init();
  }

  setKVStore(kvStore: KVStore) {
    this.kvStore = kvStore;
  }

  get key(): string {
    return this._key;
  }

  @action
  setKey(value: string) {
    this._key = value;
  }

  get isSimulating(): boolean {
    return this._isSimulating;
  }

  setSimulateGasFn(simulateGasFn: SimulateGasFn) {
    this.simulateGasFn = simulateGasFn;
  }

  get enabled(): boolean {
    if (this._forceDisabled) {
      return false;
    }

    return this._enabled;
  }

  @action
  setEnabled(value: boolean) {
    if (this._forceDisabled && value) {
      console.log(
        "Gas simulator is disabled by force. You can not enable the gas simulator"
      );
      return;
    }

    this._enabled = value;
  }

  get forceDisabled(): boolean {
    return this._forceDisabled;
  }

  get forceDisableReason(): Error | undefined {
    return this._forceDisableReason;
  }

  @action
  forceDisable(valueOrReason: boolean | Error) {
    if (!valueOrReason) {
      this._forceDisabled = false;
      this._forceDisableReason = undefined;
    } else {
      if (this.enabled) {
        this.setEnabled(false);
      }
      this._forceDisabled = true;
      if (typeof valueOrReason !== "boolean") {
        this._forceDisableReason = valueOrReason;
      }
    }
  }

  get error(): Error | undefined {
    const key = this.storeKey;
    const state = this.getState(key);
    return state.error;
  }

  get gasEstimated(): number | undefined {
    const key = this.storeKey;
    const state = this.getState(key);

    if (state.recentGasEstimated != null) {
      return state.recentGasEstimated;
    }

    return state.initialGasEstimated;
  }

  get gasAdjustment(): number {
    if (this._gasAdjustmentValue === "") {
      return 0;
    }

    const num = parseFloat(this._gasAdjustmentValue);
    if (Number.isNaN(num) || num < 0) {
      return 0;
    }

    return num;
  }

  get gasAdjustmentValue(): string {
    return this._gasAdjustmentValue;
  }

  @action
  setGasAdjustmentValue(gasAdjustment: string | number) {
    if (typeof gasAdjustment === "number") {
      if (gasAdjustment < 0 || gasAdjustment > 3) {
        return;
      }

      this._gasAdjustmentValue = gasAdjustment.toString();
      return;
    }

    if (gasAdjustment === "") {
      this._gasAdjustmentValue = "";
      return;
    }

    if (gasAdjustment.startsWith(".")) {
      this._gasAdjustmentValue = "0" + gasAdjustment;
    }

    const num = parseFloat(gasAdjustment);
    if (Number.isNaN(num) || num < 0 || num > 3) {
      return;
    }

    this._gasAdjustmentValue = gasAdjustment;
  }

  get evmSimulationOutcome(): EvmGasSimulationOutcome | undefined {
    const key = this.storeKey;
    const state = this.getState(key);
    return state.recentEvmSimulationOutcome;
  }

  protected init() {
    this._disposers.push(
      autorun(() => {
        if (!this.enabled) {
          return;
        }

        const key = this.storeKey;
        const state = this.getState(key);

        this.kvStore.get<string>(key).then((saved) => {
          if (saved) {
            try {
              const gas = JSON.parse(saved);
              if (typeof gas === "number") {
                state.setInitialGasEstimated(gas);
              }
            } catch (e) {
              console.warn(e);
              this.kvStore.set(key, "");
            }
          }

          state.setIsInitialized(true);
        });
      })
    );

    // Every time the observable used in simulateGasFn is updated, the simulation is refreshed.
    // The simulation is also refreshed when changing from zero fee to paying fee or vice versa.
    this._disposers.push(
      autorun(() => {
        if (!this.enabled) {
          return;
        }

        try {
          const key = this.storeKey;
          const state = this.getState(key);

          if (!state.isInitialized) {
            return;
          }

          const { simulate } = this.simulateGasFn();
          const isZeroFee = GasSimulatorState.isZeroFee(this.feeConfig.fee);

          runInAction(() => {
            if (
              state.recentGasEstimated == null ||
              state.error != null ||
              state.isZeroFee !== isZeroFee
            ) {
              state.refreshSimulateFn(simulate);
              state.setIsZeroFee(isZeroFee);
            }
          });
        } catch (e) {
          console.log(e);
          return;
        }
      })
    );

    this._disposers.push(
      autorun(() => {
        const key = this.storeKey;
        const state = this.getState(key);

        if (!state.simulateFn) {
          return;
        }

        if (this._debounceTimeoutId) {
          clearTimeout(this._debounceTimeoutId);
        }

        const promise = state.simulateFn();

        this._debounceTimeoutId = setTimeout(() => {
          runInAction(() => {
            this._isSimulating = true;
          });

          promise
            .then((res) => {
              const { gasUsed, evmSimulationOutcome } = res;

              const shouldUpdate =
                !state.recentGasEstimated ||
                Math.abs(state.recentGasEstimated - gasUsed) /
                  state.recentGasEstimated >
                  0.02 ||
                evmSimulationOutcome !== state.recentEvmSimulationOutcome;

              if (shouldUpdate) {
                state.setRecentGasEstimated(gasUsed);
                state.setRecentEvmSimulationOutcome(evmSimulationOutcome);
              }

              state.setError(undefined);

              this.kvStore.set(key, JSON.stringify(gasUsed)).catch((e) => {
                console.log(e);
              });
            })
            .catch((e) => {
              console.log("evm gas simulate error", e);
              if (isSimpleFetchError(e) && e.response) {
                let message = "";
                const contentType: string = e.response.headers
                  ? e.response.headers.get("content-type") || ""
                  : "";
                if (
                  contentType.startsWith("text/plain") &&
                  typeof e.response.data === "string"
                ) {
                  message = e.response.data;
                }
                if (
                  contentType.startsWith("application/json") &&
                  e.response.data?.message &&
                  typeof e.response.data?.message === "string"
                ) {
                  message = e.response.data.message;
                }

                if (message !== "") {
                  state.setError(new Error(message));
                  return;
                }
              }

              state.setError(e);
            })
            .finally(() => {
              runInAction(() => {
                this._isSimulating = false;
              });
            });
        }, this._debounceMs);
      })
    );

    this._disposers.push(
      autorun(() => {
        if (
          this.enabled &&
          this.gasEstimated != null &&
          !Number.isNaN(this.gasEstimated)
        ) {
          this.gasConfig.setValue(this.gasEstimated * this.gasAdjustment);
        }
      })
    );
  }

  dispose() {
    for (const disposer of this._disposers) {
      disposer();
    }
  }

  get uiProperties(): UIProperties {
    const key = this.storeKey;
    const state = this.getState(key);

    return {
      warning: (() => {
        if (this.forceDisableReason) {
          return this.forceDisableReason;
        }

        if (this.error) {
          return this.error;
        }
      })(),
      loadingState: (() => {
        if (!this.enabled) {
          return;
        }

        if (this.isSimulating) {
          return state.initialGasEstimated == null
            ? "loading-block"
            : "loading";
        }
      })(),
    };
  }

  protected getState(key: string): GasSimulatorState {
    if (!this._stateMap.has(key)) {
      runInAction(() => {
        this._stateMap.set(key, new GasSimulatorState());
      });
    }

    return this._stateMap.get(key)!;
  }

  @computed
  protected get storeKey(): string {
    const chainIdentifier = ChainIdHelper.parse(this.chainId);
    const feeDenom = this.feeConfig.fee?.currency.coinMinimalDenom ?? "";
    return `${chainIdentifier.identifier}/${feeDenom}/${this.key}`;
  }
}

// CONTRACT: Use with `observer`
export const useGasSimulator = (
  kvStore: KVStore,
  chainGetter: ChainGetter,
  chainId: string,
  gasConfig: IGasConfig,
  feeConfig: IFeeConfig,
  key: string,
  simulateGasFn: SimulateGasFn,
  initialDisabled?: boolean
) => {
  const [gasSimulator] = useState(() => {
    const gasSimulator = new GasSimulator(
      kvStore,
      chainGetter,
      chainId,
      gasConfig,
      feeConfig,
      key,
      simulateGasFn
    );
    if (initialDisabled) {
      gasSimulator.setEnabled(false);
    } else {
      gasSimulator.setEnabled(true);
    }

    return gasSimulator;
  });
  gasSimulator.setKVStore(kvStore);
  gasSimulator.setChain(chainId);
  gasSimulator.setKey(key);
  gasSimulator.setSimulateGasFn(simulateGasFn);

  useEffect(() => {
    return () => {
      gasSimulator.dispose();
    };
  }, [gasSimulator]);

  return gasSimulator;
};
