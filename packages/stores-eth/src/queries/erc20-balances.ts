import { DenomHelper } from "@keplr-wallet/common";
import {
  computed,
  IReactionDisposer,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  reaction,
  runInAction,
} from "mobx";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { AppCurrency } from "@keplr-wallet/types";
import {
  BalanceRegistry,
  ChainGetter,
  IObservableQueryBalanceImpl,
  ObservableJsonRPCQuery,
  QueryError,
  QueryResponse,
  QuerySharedContext,
} from "@keplr-wallet/stores";
import bigInteger from "big-integer";
import { EthereumAccountBase } from "../account";
import { ObservableQueryEthereumERC20BalancesBatchParent } from "./erc20-balance-batch";
import { ERC20BalanceBatchParentStore } from "./erc20-batch-parent-store";

const thirdparySupportedChainIdMap: Record<string, string> = {
  "eip155:1": "eth",
  "eip155:10": "opt",
  "eip155:137": "polygon",
  "eip155:8453": "base",
  "eip155:42161": "arb",
};

interface ThirdpartyERC20TokenBalance {
  address: string;
  tokenBalances: {
    contractAddress: string;
    tokenBalance: string | null;
    error: {
      code: number;
      message: string;
    } | null;
  }[];
  // TODO: Support pagination.
  pageKey?: string;
}

export class ObservableQueryThirdpartyERC20BalancesImplParent extends ObservableJsonRPCQuery<ThirdpartyERC20TokenBalance> {
  // XXX: See comments below.
  //      The reason why this field is here is that I don't know if it's mobx's bug or intention,
  //      but fetch can be executed twice by observation of parent and child by `onBecomeObserved`,
  //      so fetch should not be overridden in this parent class.
  public duplicatedFetchResolver?: Promise<void>;

  @observable.shallow
  protected alchemyContractSet: Set<string> = new Set();

  constructor(
    sharedContext: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter,
    protected readonly ethereumHexAddress: string,
    public readonly batchParent: ObservableQueryEthereumERC20BalancesBatchParent
  ) {
    const tokenAPIURL = `https://evm-${chainId.replace(
      "eip155:",
      ""
    )}.keplr.app/api`;
    super(sharedContext, tokenAPIURL, "", "alchemy_getTokenBalances", [
      ethereumHexAddress,
      "erc20",
      {
        // TODO: Support pagination.
        // The maximum count of token balances is 100.
        maxCount: 100,
      },
    ]);

    makeObservable(this);
  }

  protected override canFetch(): boolean {
    // If ethereum hex address is empty, it will always fail, so don't need to fetch it.
    return (
      this.ethereumHexAddress.length > 0 &&
      thirdparySupportedChainIdMap[this.chainId] != null
    );
  }

  protected override onReceiveResponse(
    response: Readonly<QueryResponse<ThirdpartyERC20TokenBalance>>
  ) {
    super.onReceiveResponse(response);

    const mcInfo = this.chainGetter.getModularChain(this.chainId);
    const next = new Set<string>();
    const erc20Denoms: string[] = [];
    for (const tokenBalance of response.data.tokenBalances) {
      if (tokenBalance.tokenBalance != null) {
        next.add(tokenBalance.contractAddress.toLowerCase());
        if (BigInt(tokenBalance.tokenBalance) > 0) {
          erc20Denoms.push(`erc20:${tokenBalance.contractAddress}`);
        }
      }
    }
    runInAction(() => {
      this.alchemyContractSet = next;
    });
    if (erc20Denoms.length > 0) {
      mcInfo.addUnknownDenoms(...erc20Denoms);
    }
  }

  hasAlchemyBalance(contract: string): boolean {
    return this.alchemyContractSet.has(contract.toLowerCase());
  }

  getAlchemyTokenBalance(
    contract: string
  ): ThirdpartyERC20TokenBalance["tokenBalances"][number] | undefined {
    return this.response?.data.tokenBalances.find(
      (bal) => bal.contractAddress.toLowerCase() === contract.toLowerCase()
    );
  }

  get isAlchemyResponseComplete(): boolean {
    return !!this.response && !this.response.data.pageKey;
  }

  resolvesAlchemyBalance(contract: string): boolean {
    const tokenBalance = this.getAlchemyTokenBalance(contract);
    return (
      tokenBalance?.tokenBalance != null ||
      (this.isAlchemyResponseComplete && !tokenBalance)
    );
  }
}

export class ObservableQueryThirdpartyERC20BalancesImpl
  implements IObservableQueryBalanceImpl
{
  protected batchReactionDisposer?: IReactionDisposer;
  @observable
  protected isInBatch = false;
  protected observedProps = 0;

  constructor(
    protected readonly parent: ObservableQueryThirdpartyERC20BalancesImplParent,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter,
    protected readonly denomHelper: DenomHelper
  ) {
    makeObservable(this);

    const contract = denomHelper.contractAddress;
    // Readiness gates in hooks-evm can early-return on `response` before
    // reading `balance`, so track observation across both to register the
    // contract with the batch parent when needed.
    const installReaction = () => {
      // Register to batch only when Alchemy can't cover the contract, to avoid
      // duplicate eth_call against tokens Alchemy already returns.
      this.batchReactionDisposer = reaction(
        () => {
          // Alchemy error forces fallback even when a stale `response` still
          // advertises the contract as covered.
          if (parent.error) return "missing";
          if (!parent.response) return "pending";
          if (parent.resolvesAlchemyBalance(contract)) return "covered";
          return "missing";
        },
        (status) => {
          if (status === "missing" && !this.isInBatch) {
            runInAction(() => {
              this.isInBatch = true;
            });
            parent.batchParent.addContract(contract);
          } else if (status !== "missing" && this.isInBatch) {
            runInAction(() => {
              this.isInBatch = false;
            });
            parent.batchParent.removeContract(contract);
          }
        },
        { fireImmediately: true }
      );
    };
    const teardownReaction = () => {
      this.batchReactionDisposer?.();
      this.batchReactionDisposer = undefined;
      if (this.isInBatch) {
        runInAction(() => {
          this.isInBatch = false;
        });
        parent.batchParent.removeContract(contract);
      }
    };
    const attach = (prop: "balance" | "response" | "error") => {
      onBecomeObserved(this, prop, () => {
        if (this.observedProps++ === 0) installReaction();
      });
      onBecomeUnobserved(this, prop, () => {
        if (--this.observedProps === 0) teardownReaction();
      });
    };
    attach("balance");
    attach("response");
    attach("error");
  }

  @computed
  get balance(): CoinPretty {
    const currency = this.currency;
    const contract = this.denomHelper.contractAddress;

    if (this.alchemyResolvesBalance) {
      const tokenBalance = this.parent.getAlchemyTokenBalance(contract);
      if (tokenBalance?.tokenBalance != null) {
        return new CoinPretty(
          currency,
          new Int(BigInt(tokenBalance.tokenBalance))
        );
      }
      const lastKnown = this.parent.batchParent.getLastKnownBalance(contract);
      if (lastKnown !== undefined) {
        return new CoinPretty(
          currency,
          new Int(bigInteger(lastKnown.replace("0x", ""), 16).toString())
        );
      }
      return new CoinPretty(currency, new Int(0));
    }

    const raw = this.parent.batchParent.getBalance(contract);
    if (raw !== undefined) {
      return new CoinPretty(
        currency,
        new Int(bigInteger(raw.replace("0x", ""), 16).toString())
      );
    }

    return new CoinPretty(currency, new Int(0)).ready(false);
  }

  @computed
  get currency(): AppCurrency {
    const denom = this.denomHelper.denom;

    return this.chainGetter
      .getModularChain(this.chainId)
      .forceFindCurrency(denom);
  }

  // Whether the contract is currently sourced from a healthy Alchemy response.
  // Derived from actual data/error state so imperative callers (which never
  // flip `isInBatch`) observe the same semantics as the reaction path.
  @computed
  protected get alchemyResolvesBalance(): boolean {
    return (
      !this.parent.error &&
      !!this.parent.response &&
      this.parent.resolvesAlchemyBalance(this.denomHelper.contractAddress)
    );
  }

  @computed
  get error(): Readonly<QueryError<unknown>> | undefined {
    if (this.alchemyResolvesBalance) return undefined;
    const contract = this.denomHelper.contractAddress;
    const batchErr = this.parent.batchParent.getError(contract);
    if (batchErr) return batchErr;
    // Batch has valid data — suppress any lingering Alchemy error.
    if (this.parent.batchParent.getBalance(contract) !== undefined) {
      return undefined;
    }
    // Still loading — stay quiet until the fallback settles.
    return undefined;
  }
  get isFetching(): boolean {
    if (!this.alchemyResolvesBalance) {
      return (
        this.parent.batchParent.isFetchingContract(
          this.denomHelper.contractAddress
        ) || this.parent.isFetching
      );
    }
    return this.parent.isFetching;
  }
  get isObserved(): boolean {
    return this.parent.isObserved;
  }
  get isStarted(): boolean {
    return this.parent.isStarted;
  }
  @computed
  get response():
    | Readonly<QueryResponse<ThirdpartyERC20TokenBalance>>
    | undefined {
    // Readiness must gate on actual data availability, not the
    // observation-driven `isInBatch` flag, so imperative callers also see
    // batch-backed readiness for tokens missing from Alchemy.
    if (this.alchemyResolvesBalance) return this.parent.response;
    const raw = this.parent.batchParent.getBalance(
      this.denomHelper.contractAddress
    );
    if (raw === undefined) return undefined;
    return {
      data: {
        address: "",
        tokenBalances: [],
        pageKey: "",
      },
      staled: false,
      local: false,
      timestamp: 0,
    };
  }

  fetch(): Promise<void> {
    // XXX: The ERC20 balances via thirdparty token API can share the result of one endpoint.
    //      This class is implemented for this optimization.
    //      But the problem is that the query store can't handle these process properly right now.
    //      Currently, this is the only use-case,
    //      so We'll manually implement this here.
    //      In the case of fetch(), even if it is executed multiple times,
    //      the actual logic should be processed only once.
    //      So some sort of debouncing is needed.
    if (!this.parent.duplicatedFetchResolver) {
      this.parent.duplicatedFetchResolver = new Promise<void>(
        (resolve, reject) => {
          (async () => {
            try {
              await this.parent.fetch();
              this.parent.duplicatedFetchResolver = undefined;
              resolve();
            } catch (e) {
              this.parent.duplicatedFetchResolver = undefined;
              reject(e);
            }
          })();
        }
      );
    }
    const alchemyFetch = this.parent.duplicatedFetchResolver;
    return alchemyFetch.then(() => this.awaitFallbackIfMissing());
  }

  // After Alchemy resolves, check Alchemy coverage directly (not via the
  // observation-driven reaction) so imperative callers also exercise the
  // batch fallback for tokens missing from Alchemy.
  protected async awaitFallbackIfMissing(): Promise<void> {
    // balanceImplMap doesn't evict on currency removal.
    if (!this.isCurrencyRegistered()) return;
    const contract = this.denomHelper.contractAddress;
    // Mirror the reaction: an Alchemy error forces fallback even when a
    // stale response still advertises the contract as covered.
    const coveredByAlchemy =
      !this.parent.error &&
      !!this.parent.response &&
      this.parent.resolvesAlchemyBalance(contract);
    if (coveredByAlchemy) return;
    this.parent.batchParent.addContract(contract);
    try {
      await this.parent.batchParent.waitFreshResponse();
    } finally {
      this.parent.batchParent.removeContract(contract);
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

  async waitFreshResponse(): Promise<
    Readonly<QueryResponse<unknown>> | undefined
  > {
    await this.parent.waitFreshResponse();
    await this.awaitFallbackIfMissing();
    return this.response;
  }

  async waitResponse(): Promise<Readonly<QueryResponse<unknown>> | undefined> {
    await this.parent.waitResponse();
    await this.awaitFallbackIfMissing();
    return this.response;
  }
}

export class ObservableQueryThirdpartyERC20BalanceRegistry
  implements BalanceRegistry
{
  protected parentMap: Map<
    string,
    ObservableQueryThirdpartyERC20BalancesImplParent
  > = new Map();

  constructor(
    protected readonly sharedContext: QuerySharedContext,
    protected readonly batchParentStore: ERC20BalanceBatchParentStore
  ) {}

  getBalanceImpl(
    chainId: string,
    chainGetter: ChainGetter,
    address: string,
    minimalDenom: string
  ): ObservableQueryThirdpartyERC20BalancesImpl | undefined {
    const denomHelper = new DenomHelper(minimalDenom);
    const mcInfo = chainGetter.getModularChain(chainId);
    const isHexAddress =
      EthereumAccountBase.isEthereumHexAddressWithChecksum(address);
    if (
      !Object.keys(thirdparySupportedChainIdMap).includes(chainId) ||
      denomHelper.type !== "erc20" ||
      !isHexAddress ||
      (mcInfo.type !== "evm" && mcInfo.type !== "ethermint")
    ) {
      return;
    }
    const key = `${chainId}/${address}`;

    if (!this.parentMap.has(key)) {
      const batchParent = this.batchParentStore.getOrCreate(
        chainId,
        chainGetter,
        address
      );
      this.parentMap.set(
        key,
        new ObservableQueryThirdpartyERC20BalancesImplParent(
          this.sharedContext,
          chainId,
          chainGetter,
          address,
          batchParent
        )
      );
    }

    return new ObservableQueryThirdpartyERC20BalancesImpl(
      this.parentMap.get(key)!,
      chainId,
      chainGetter,
      denomHelper
    );
  }
}
