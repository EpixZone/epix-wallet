import {
  ChainGetter,
  JsonRpcBatchRequest,
  ObservableJsonRpcBatchQuery,
  QueryError,
  QuerySharedContext,
} from "@keplr-wallet/stores";
import { makeObservable, observable, reaction, runInAction, when } from "mobx";
import { erc20ContractInterface } from "../constants";

const BATCH_CHUNK_SIZE = 10;
const REBUILD_DEBOUNCE_MS = 200;

export class ObservableQueryEthereumERC20BalancesBatchParent {
  @observable.shallow
  protected refcount: Map<string, number> = new Map();

  @observable.ref
  protected batchQueries: ObservableJsonRpcBatchQuery<string>[] = [];

  @observable.ref
  protected batchQueryKeys: string[] = [];

  @observable.shallow
  protected lastKnownBalances: Map<string, string> = new Map();

  @observable.ref
  protected lastBuiltKey = "";

  // Snapshot of contract → batchQueries index at rebuild time, so getError
  // doesn't misattribute chunk ownership during debounce transitions when
  // the live refcount no longer matches the current batchQueries layout.
  @observable.ref
  protected chunkIndex: Map<string, number> = new Map();

  constructor(
    protected readonly sharedContext: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter,
    protected readonly ethereumHexAddress: string
  ) {
    makeObservable(this);

    reaction(
      () => {
        const keys = Array.from(this.refcount.keys()).sort().join(",");
        // Include the RPC URL so a runtime endpoint change (user-configured
        // custom RPC) triggers a rebuild against the new endpoint.
        return `${this.getRpcUrl()}::${keys}`;
      },
      (key) => this.rebuildBatchQueries(key),
      { fireImmediately: true, delay: REBUILD_DEBOUNCE_MS }
    );
  }

  addContract(contract: string): void {
    const key = contract.toLowerCase();
    runInAction(() => {
      this.refcount.set(key, (this.refcount.get(key) ?? 0) + 1);
    });
  }

  removeContract(contract: string): void {
    const key = contract.toLowerCase();
    const n = this.refcount.get(key);
    if (n === undefined) return;
    runInAction(() => {
      if (n <= 1) {
        this.refcount.delete(key);
      } else {
        this.refcount.set(key, n - 1);
      }
    });
  }

  getBalance(contract: string): string | undefined {
    const key = contract.toLowerCase();
    const lastKnown = this.lastKnownBalances.get(key);
    for (const q of this.batchQueries) {
      trackQueryFetching(q);
      if (!q.isStarted && lastKnown !== undefined) {
        continue;
      }

      const data = q.response?.data?.[key];
      if (data !== undefined) return data;
    }
    return lastKnown;
  }

  getLastKnownBalance(contract: string): string | undefined {
    return this.lastKnownBalances.get(contract.toLowerCase());
  }

  get isFetching(): boolean {
    return this.batchQueries.some((q) => q.isFetching);
  }

  isFetchingContract(contract: string): boolean {
    const key = contract.toLowerCase();
    const chunkIdx = this.chunkIndex.get(key);
    if (chunkIdx === undefined) return false;
    const q = this.batchQueries[chunkIdx];
    if (!q) return false;
    const isFetching = trackQueryFetching(q);
    if (!q.isStarted && this.lastKnownBalances.has(key)) return false;
    return isFetching;
  }

  // Per-contract error: surface only the error of the chunk that owns this
  // contract (plus its per-request error if any). Looks up chunk ownership
  // from the snapshot taken at rebuild time to avoid misattribution during
  // debounced refcount transitions.
  getError(contract: string): QueryError<unknown> | undefined {
    const key = contract.toLowerCase();
    const chunkIdx = this.chunkIndex.get(key);
    if (chunkIdx === undefined) return undefined;
    const q = this.batchQueries[chunkIdx];
    if (!q) return undefined;
    trackQueryFetching(q);
    if (!q.isStarted && this.lastKnownBalances.has(key)) return undefined;
    if (q.error) return q.error;
    const perReq = q.perRequestErrors[key];
    if (perReq) {
      return {
        status: 0,
        statusText: "batch-request-error",
        message: perReq.message,
        data: perReq as unknown,
      };
    }
    return undefined;
  }

  protected currentKey(): string {
    const keys = Array.from(this.refcount.keys()).sort().join(",");
    return `${this.getRpcUrl()}::${keys}`;
  }

  async waitFreshResponse(): Promise<void> {
    // The reaction that rebuilds batchQueries is debounced, so refcount can
    // change without batchQueries catching up. Wait until the built key
    // matches the current (refcount + rpc) snapshot.
    await when(() => this.currentKey() === this.lastBuiltKey);
    await Promise.all(this.batchQueries.map((q) => q.waitFreshResponse()));
    this.rememberCurrentBatchBalances();
  }

  protected rebuildBatchQueries(key: string): void {
    this.rememberCurrentBatchBalances();

    if (this.refcount.size === 0) {
      runInAction(() => {
        this.batchQueries = [];
        this.batchQueryKeys = [];
        this.lastBuiltKey = key;
        this.chunkIndex = new Map();
      });
      return;
    }

    const rpcUrl = this.getRpcUrl();
    if (!rpcUrl) {
      runInAction(() => {
        this.batchQueries = [];
        this.batchQueryKeys = [];
        this.lastBuiltKey = key;
        this.chunkIndex = new Map();
      });
      return;
    }

    const contracts = Array.from(this.refcount.keys()).sort();
    const chunks = chunkArray(contracts, BATCH_CHUNK_SIZE);

    const calldata = (to: string) => ({
      to,
      data: erc20ContractInterface.encodeFunctionData("balanceOf", [
        this.ethereumHexAddress,
      ]),
    });

    const nextChunkIndex = new Map<string, number>();
    chunks.forEach((chunk, idx) => {
      for (const c of chunk) nextChunkIndex.set(c, idx);
    });

    const previousQueries = new Map<
      string,
      ObservableJsonRpcBatchQuery<string>
    >();
    this.batchQueries.forEach((q, idx) => {
      const queryKey = this.batchQueryKeys[idx];
      if (queryKey) {
        previousQueries.set(queryKey, q);
      }
    });

    const nextBatchQueryKeys = chunks.map(
      (chunk) => `${rpcUrl}::${chunk.join(",")}`
    );

    runInAction(() => {
      this.batchQueries = chunks.map((chunk, idx) => {
        const queryKey = nextBatchQueryKeys[idx];
        const previous = previousQueries.get(queryKey);
        if (previous) {
          return previous;
        }

        const requests: JsonRpcBatchRequest[] = chunk.map((c) => ({
          method: "eth_call",
          params: [calldata(c), "latest"],
          id: c,
        }));
        return new ObservableJsonRpcBatchQuery<string>(
          this.sharedContext,
          rpcUrl,
          "",
          requests
        );
      });
      this.batchQueryKeys = nextBatchQueryKeys;
      this.lastBuiltKey = key;
      this.chunkIndex = nextChunkIndex;
    });
  }

  protected rememberCurrentBatchBalances(): void {
    const entries: [string, string][] = [];
    for (const q of this.batchQueries) {
      const data = q.response?.data;
      if (!data) {
        continue;
      }

      for (const [contract, balance] of Object.entries(data)) {
        entries.push([contract.toLowerCase(), balance]);
      }
    }

    if (entries.length === 0) {
      return;
    }

    runInAction(() => {
      for (const [contract, balance] of entries) {
        this.lastKnownBalances.set(contract, balance);
      }
    });
  }

  protected getRpcUrl(): string {
    const u = this.chainGetter.getModularChain(this.chainId).unwrapped;
    return u.type === "evm" || u.type === "ethermint" ? u.evm.rpc : "";
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function trackQueryFetching(
  query: ObservableJsonRpcBatchQuery<string>
): boolean {
  // Reading `isFetching` starts ObservableQuery when a caller observes the
  // parent state, while still letting getters return cached last-known data.
  return query.isFetching;
}
