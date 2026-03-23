import { ObservableQuery, QueryError, QuerySharedContext } from "../common";
import { ChainGetter, getCosmosInfo } from "../chain";
import { HasMapStore } from "../common";

export class ObservableChainQueryRPC<
  T = unknown,
  E = unknown
> extends ObservableQuery<T, E> {
  // Chain Id should not be changed after creation.
  protected readonly _chainId: string;
  protected readonly chainGetter: ChainGetter;

  protected readonly isCosmos: boolean;

  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    url: string
  ) {
    const cosmosInfo = getCosmosInfo(chainGetter.getModularChain(chainId));

    super(sharedContext, cosmosInfo?.rpc || "", url);

    this.isCosmos = !!cosmosInfo;

    this._chainId = chainId;
    this.chainGetter = chainGetter;
  }

  protected override canFetch(): boolean {
    return this.isCosmos && this.baseURL !== "";
  }

  public override get error(): Readonly<QueryError<E>> | undefined {
    if (!this.isCosmos) {
      return {
        status: 400,
        statusText: `${this.chainId} is not for cosmos based chain`,
        message: `${this.chainId} is not for cosmos based chain`,
      };
    } else {
      return super.error;
    }
  }

  get chainId(): string {
    return this._chainId;
  }
}

export class ObservableChainQueryRPCMap<
  T = unknown,
  E = unknown
> extends HasMapStore<ObservableChainQueryRPC<T, E>> {
  constructor(
    protected readonly sharedContext: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter,
    creater: (key: string) => ObservableChainQueryRPC<T, E>
  ) {
    super(creater);
  }
}
