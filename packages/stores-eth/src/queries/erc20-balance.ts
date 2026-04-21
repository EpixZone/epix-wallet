import {
  BalanceRegistry,
  ChainGetter,
  IObservableQueryBalanceImpl,
  QueryError,
  QueryResponse,
  QuerySharedContext,
} from "@keplr-wallet/stores";
import { AppCurrency } from "@keplr-wallet/types";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import {
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  runInAction,
} from "mobx";
import bigInteger from "big-integer";
import { DenomHelper } from "@keplr-wallet/common";
import { EthereumAccountBase } from "../account";
import { ObservableQueryEthereumERC20BalancesBatchParent } from "./erc20-balance-batch";
import { ERC20BalanceBatchParentStore } from "./erc20-batch-parent-store";

export class ObservableQueryEthereumERC20BalanceImpl
  implements IObservableQueryBalanceImpl
{
  @observable
  protected _observedProps = 0;

  constructor(
    protected readonly parent: ObservableQueryEthereumERC20BalancesBatchParent,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter,
    protected readonly denomHelper: DenomHelper,
    protected readonly contractAddress: string
  ) {
    makeObservable(this);

    // Readiness gates (hooks-evm) can early-return on `response` before
    // reading `balance`, so either property being observed must register
    // the contract into the shared batch parent.
    const attach = (prop: "balance" | "response" | "error") => {
      onBecomeObserved(this, prop, () => {
        runInAction(() => {
          this._observedProps += 1;
        });
        if (this._observedProps === 1) {
          this.parent.addContract(contractAddress);
        }
      });
      onBecomeUnobserved(this, prop, () => {
        runInAction(() => {
          this._observedProps -= 1;
        });
        if (this._observedProps === 0) {
          this.parent.removeContract(contractAddress);
        }
      });
    };
    attach("balance");
    attach("response");
    attach("error");
  }

  @computed
  get balance(): CoinPretty {
    const currency = this.currency;
    const raw = this.parent.getBalance(this.contractAddress);
    if (raw === undefined) {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }
    return new CoinPretty(
      currency,
      new Int(bigInteger(raw.replace("0x", ""), 16).toString())
    );
  }

  @computed
  get currency(): AppCurrency {
    return this.chainGetter
      .getModularChain(this.chainId)
      .forceFindCurrency(this.denomHelper.denom);
  }

  get isFetching(): boolean {
    return this.parent.isFetching;
  }
  get isObserved(): boolean {
    return this._observedProps > 0;
  }
  get isStarted(): boolean {
    return this._observedProps > 0;
  }
  @computed
  get error(): QueryError<unknown> | undefined {
    return this.parent.getError(this.contractAddress);
  }
  @computed
  get response(): Readonly<QueryResponse<unknown>> | undefined {
    // hooks-evm tx flow gates readiness on truthy `bal.response`. Synthesize
    // from the shared batch parent so the Child advertises fetch completion.
    const raw = this.parent.getBalance(this.contractAddress);
    if (raw === undefined) return undefined;
    return {
      data: raw,
      staled: false,
      local: false,
      timestamp: 0,
    };
  }

  protected async ensureFetched(): Promise<void> {
    // balanceImplMap doesn't evict on currency removal.
    if (!this.isCurrencyRegistered()) return;
    // Force temporary registration so imperative callers (outside a reactive
    // observer) still trigger an actual eth_call.
    this.parent.addContract(this.contractAddress);
    try {
      await this.parent.waitFreshResponse();
    } finally {
      this.parent.removeContract(this.contractAddress);
    }
  }

  protected isCurrencyRegistered(): boolean {
    const target = DenomHelper.normalizeDenom(this.denomHelper.denom);
    return this.chainGetter
      .getModularChain(this.chainId)
      .currencies.some(
        (c) => DenomHelper.normalizeDenom(c.coinMinimalDenom) === target
      );
  }

  fetch(): Promise<void> {
    return this.ensureFetched();
  }

  async waitFreshResponse(): Promise<
    Readonly<QueryResponse<unknown>> | undefined
  > {
    await this.ensureFetched();
    return this.response;
  }

  async waitResponse(): Promise<Readonly<QueryResponse<unknown>> | undefined> {
    return await this.waitFreshResponse();
  }
}

export class ObservableQueryEthereumERC20BalanceRegistry
  implements BalanceRegistry
{
  constructor(
    protected readonly sharedContext: QuerySharedContext,
    protected readonly batchParentStore: ERC20BalanceBatchParentStore
  ) {}

  getBalanceImpl(
    chainId: string,
    chainGetter: ChainGetter,
    address: string,
    minimalDenom: string
  ): IObservableQueryBalanceImpl | undefined {
    const denomHelper = new DenomHelper(minimalDenom);
    const mcInfo = chainGetter.getModularChain(chainId);
    const isHexAddress =
      EthereumAccountBase.isEthereumHexAddressWithChecksum(address);
    if (
      denomHelper.type !== "erc20" ||
      !isHexAddress ||
      (mcInfo.type !== "evm" && mcInfo.type !== "ethermint")
    ) {
      return;
    }

    const parent = this.batchParentStore.getOrCreate(
      chainId,
      chainGetter,
      address
    );

    return new ObservableQueryEthereumERC20BalanceImpl(
      parent,
      chainId,
      chainGetter,
      denomHelper,
      denomHelper.contractAddress
    );
  }
}
