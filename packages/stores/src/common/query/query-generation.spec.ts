/** Real query state machines with controlled IO/publication boundaries. No network. */
import { autorun, runInAction } from "mobx";
import { MemoryKVStore } from "@keplr-wallet/common";
import { ChainInfo, SettledResponse } from "@keplr-wallet/types";
import { ChainStore } from "../../chain/base";
import { ObservableChainQuery } from "../../query/chain-query";
import { QuerySharedContext } from "./context";
import { ObservableQuery, QueryOptions, QueryResponse } from "./query";
let fixtureId = 0;
class Deferred<T> {
  settled = false;
  readonly promise: Promise<T>;
  private resolvePromise!: (value: T) => void;
  private rejectPromise!: (error: unknown) => void;
  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }
  resolve(value: T) {
    if (!this.settled) {
      this.settled = true;
      this.resolvePromise(value);
    }
  }
  reject(error: unknown) {
    if (!this.settled) {
      this.settled = true;
      this.rejectPromise(error);
    }
  }
}
class SerializableKV extends MemoryKVStore {
  override set<T = unknown>(key: string, value: T): Promise<void> {
    return super.set(key, JSON.parse(JSON.stringify(value)));
  }
}
class ControlledContext extends QuerySharedContext {
  holdDisk = false;
  holdPublication = false;
  readonly disk: {
    key: string;
    gate: Deferred<SettledResponse<QueryResponse<string> | undefined>>;
  }[] = [];
  readonly publications: Deferred<void>[] = [];
  readonly writes: { key: string; data: string }[] = [];
  constructor(
    readonly memory = new SerializableKV(`query-generation-${fixtureId++}`)
  ) {
    super(memory, { responseDebounceMs: 0 });
  }
  override loadStore<T = unknown>(
    key: string,
    action: (value: SettledResponse<T | undefined>) => void
  ): Promise<void> {
    const gate = new Deferred<
      SettledResponse<QueryResponse<string> | undefined>
    >();
    this.disk.push({ key, gate });
    if (!this.holdDisk) gate.resolve({ status: "fulfilled", value: undefined });
    return gate.promise.then((value) =>
      runInAction(() => action(value as SettledResponse<T | undefined>))
    );
  }
  override handleResponse(action: () => void): Promise<void> {
    const gate = new Deferred<void>();
    this.publications.push(gate);
    if (!this.holdPublication) gate.resolve();
    // QuerySharedContext's real DebounceActionTimer also invokes callbacks in an action.
    return gate.promise.then(() => runInAction(action));
  }
  override async saveResponse(key: string, response: unknown): Promise<void> {
    this.writes.push({ key, data: (response as QueryResponse<string>).data });
    await super.saveResponse(key, response);
  }
  releaseAll() {
    this.disk.forEach((item) =>
      item.gate.resolve({ status: "fulfilled", value: undefined })
    );
    this.publications.forEach((gate) => gate.resolve());
  }
}
class Transport {
  readonly requests: {
    key: string;
    gate: Deferred<{ headers: unknown; data: string }>;
    signal: AbortSignal;
  }[] = [];
  fetch(key: string, controller: AbortController) {
    const gate = new Deferred<{ headers: unknown; data: string }>();
    this.requests.push({ key, gate, signal: controller.signal });
    // Deliberately not abort-aware. A provider may finish even after cancellation.
    return gate.promise;
  }
  finish(index: number, data: string) {
    this.requests[index].gate.resolve({ headers: {}, data });
  }
  fail(index: number, error: unknown) {
    this.requests[index].gate.reject(error);
  }
  releaseAll() {
    this.requests.forEach((item) =>
      item.gate.resolve({ headers: {}, data: "cleanup" })
    );
  }
}
class ControlledQuery extends ObservableQuery<string> {
  readonly received: string[] = [];
  constructor(
    ctx: ControlledContext,
    readonly transport: Transport,
    options: Partial<QueryOptions> = {}
  ) {
    super(ctx, "http://127.0.0.1:1", "/A", options);
  }
  changePath(path: string) {
    this.setUrl(path);
  }
  cacheKey() {
    return this.getCacheKey();
  }
  protected override fetchResponse(controller: AbortController) {
    return this.transport.fetch(this.getCacheKey(), controller);
  }
  protected override onReceiveResponse(
    response: Readonly<QueryResponse<string>>
  ) {
    this.received.push(response.data);
  }
}
class SettingsChainStore extends ChainStore {
  replace(endpoint: "A" | "B") {
    this.setEmbeddedChainInfos([chain(endpoint)]);
  }
}
class ControlledRestQuery extends ObservableChainQuery<string> {
  constructor(
    ctx: ControlledContext,
    store: SettingsChainStore,
    readonly transport: Transport
  ) {
    super(ctx, "osmosis-1", store, "/node_info");
    Object.assign(this.options, { cacheMaxAge: 60_000 });
  }
  cacheKey() {
    return this.getCacheKey();
  }
  protected override fetchResponse(controller: AbortController) {
    return this.transport.fetch(this.getCacheKey(), controller);
  }
}
function chain(endpoint: "A" | "B"): ChainInfo {
  const currency = {
    coinDenom: "OSMO",
    coinMinimalDenom: "uosmo",
    coinDecimals: 6,
  };
  return {
    chainId: "osmosis-1",
    chainName: "Osmosis",
    rpc: `http://127.0.0.1:1/${endpoint}/rpc`,
    rest: `http://127.0.0.1:1/${endpoint}/rest`,
    bip44: { coinType: 118 },
    currencies: [currency],
    feeCurrencies: [currency],
    stakeCurrency: currency,
    bech32Config: {
      bech32PrefixAccAddr: "osmo",
      bech32PrefixAccPub: "osmopub",
      bech32PrefixValAddr: "osmovaloper",
      bech32PrefixValPub: "osmovaloperpub",
      bech32PrefixConsAddr: "osmovalcons",
      bech32PrefixConsPub: "osmovalconspub",
    },
  };
}
// There are no wall-clock timers or IO workers. Drain a bounded number of promise turns.
async function turns() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
function diskResponse(data: string): QueryResponse<string> {
  return { data, staled: false, local: false, timestamp: Date.now() };
}
function record(name: string, actual: unknown, expected: unknown) {
  expect({ scenario: name, actual }).toEqual({
    scenario: name,
    actual: expected,
  });
}
type WaitState = {
  settled: boolean;
  response?: Readonly<QueryResponse<string>>;
  error?: unknown;
};
async function fixture(
  test: (
    ctx: ControlledContext,
    network: Transport,
    watch: (q: ObservableQuery<string>) => () => void,
    waitFor: (q: ObservableQuery<string>) => WaitState
  ) => Promise<void>
) {
  const ctx = new ControlledContext();
  const network = new Transport();
  const disposers: (() => void)[] = [];
  const queries: ObservableQuery<string>[] = [];
  const waiters: { cancel: Deferred<void>; done: Promise<void> }[] = [];
  const waitFor = (q: ObservableQuery<string>): WaitState => {
    const state: WaitState = { settled: false };
    const owned: (() => void)[] = [];
    // Keep production MobX behavior, but own waitResponse's synchronous subscriptions
    // so a failing settlement assertion cannot leak observers into later tests.
    const mobx = jest.requireActual<typeof import("mobx")>("mobx");
    const realAutorun = mobx.autorun;
    const realReaction = mobx.reaction;
    const autorunSpy = jest
      .spyOn(mobx, "autorun")
      .mockImplementation((effect, options) => {
        const dispose = realAutorun(effect, options);
        owned.push(dispose);
        return dispose;
      });
    const reactionSpy = jest
      .spyOn(mobx, "reaction")
      .mockImplementation((expression, effect, options) => {
        const dispose = realReaction(expression, effect, options);
        owned.push(dispose);
        return dispose;
      });
    let pending: Promise<Readonly<QueryResponse<string>> | undefined>;
    try {
      pending = q.waitResponse();
    } finally {
      autorunSpy.mockRestore();
      reactionSpy.mockRestore();
    }
    const cancel = new Deferred<void>();
    const done = Promise.race([
      pending.then(
        (response) => {
          state.response = response;
          state.settled = true;
        },
        (error) => {
          state.error = error;
          state.settled = true;
        }
      ),
      cancel.promise,
    ]).finally(() => owned.forEach((dispose) => dispose()));
    waiters.push({ cancel, done });
    return state;
  };
  const watch = (q: ObservableQuery<string>) => {
    queries.push(q);
    const dispose = autorun(() => {
      void q.response;
      void q.error;
      void q.isFetching;
    });
    disposers.push(dispose);
    return dispose;
  };
  try {
    await test(ctx, network, watch, waitFor);
  } finally {
    disposers.forEach((dispose) => dispose());
    for (let i = 0; i < 4; i++) {
      ctx.releaseAll();
      network.releaseAll();
      await turns();
    }
    waiters.forEach((waiter) => waiter.cancel.resolve());
    await Promise.all(waiters.map((waiter) => waiter.done));
    await turns();
    expect(
      queries.every((q) => !q.isObserved && !q.isStarted && !q.isFetching)
    ).toBe(true);
    expect(
      ctx.disk.every((item) => item.gate.settled) &&
        ctx.publications.every((gate) => gate.settled) &&
        network.requests.every((item) => item.gate.settled)
    ).toBe(true);
  }
}

it("held fresh disk A cannot satisfy B or finish B's still-pending cache read", async () =>
  fixture(async (ctx, network, watch) => {
    ctx.holdDisk = true;
    const q = new ControlledQuery(ctx, network, { cacheMaxAge: 60_000 });
    watch(q);
    await turns();
    q.changePath("/B");
    await turns();
    expect(ctx.disk.length).toBe(2);
    ctx.disk[0].gate.resolve({
      status: "fulfilled",
      value: diskResponse("disk-A"),
    });
    await turns();
    record(
      "held-disk-after-url-switch",
      {
        data: q.response?.data ?? null,
        fetching: q.isFetching,
        hooks: q.received,
        network: network.requests.length,
      },
      { data: null, fetching: true, hooks: [], network: 0 }
    );
  }));

it("disk completion after observer disposal cannot publish or invoke response hooks", async () =>
  fixture(async (ctx, network, watch) => {
    ctx.holdDisk = true;
    const q = new ControlledQuery(ctx, network, { cacheMaxAge: 60_000 });
    const dispose = watch(q);
    await turns();
    dispose();
    ctx.disk[0].gate.resolve({
      status: "fulfilled",
      value: diskResponse("detached-disk"),
    });
    await turns();
    record(
      "held-disk-after-detach",
      {
        data: q.response?.data ?? null,
        hooks: q.received,
        started: q.isStarted,
        network: network.requests.length,
      },
      { data: null, hooks: [], started: false, network: 0 }
    );
  }));

it("an old debounced success cannot finish a newer explicit fetch of the same key", async () =>
  fixture(async (ctx, network, watch) => {
    ctx.holdPublication = true;
    const q = new ControlledQuery(ctx, network);
    watch(q);
    await turns();
    network.finish(0, "old-success");
    await turns();
    q.fetch();
    await turns();
    expect(network.requests.length).toBe(2);
    ctx.publications[0].resolve();
    await turns();
    record(
      "delayed-success-newer-fetch",
      { data: q.response?.data ?? null, fetching: q.isFetching },
      { data: null, fetching: true }
    );
  }));

it.each(["response", "request", "plain"] as const)(
  "an old debounced %s error cannot finish a newer fetch",
  async (kind) =>
    fixture(async (ctx, network, watch) => {
      ctx.holdPublication = true;
      const q = new ControlledQuery(ctx, network);
      watch(q);
      await turns();
      const error =
        kind === "response"
          ? {
              response: {
                status: 503,
                statusText: "old-error",
                headers: { get: () => "text/plain" },
                data: "old-error",
              },
            }
          : kind === "request"
          ? { request: {} }
          : new Error("old-error");
      network.fail(0, error);
      await turns();
      q.fetch();
      await turns();
      expect(network.requests.length).toBe(2);
      ctx.publications[0].resolve();
      await turns();
      record(
        `delayed-${kind}-error-newer-fetch`,
        { error: q.error?.message ?? null, fetching: q.isFetching },
        { error: null, fetching: true }
      );
    })
);

it("detaching and reusing a query rejects its old queued publication", async () =>
  fixture(async (ctx, network, watch) => {
    ctx.holdPublication = true;
    const q = new ControlledQuery(ctx, network);
    const dispose = watch(q);
    await turns();
    network.finish(0, "previous-lifetime");
    await turns();
    dispose();
    watch(q);
    await turns();
    expect(network.requests.length).toBe(2);
    ctx.publications[0].resolve();
    await turns();
    record(
      "delayed-success-after-reuse",
      {
        data: q.response?.data ?? null,
        fetching: q.isFetching,
        started: q.isStarted,
      },
      { data: null, fetching: true, started: true }
    );
  }));

it("A to B to A rejects both earlier generations even when the cache key matches again", async () =>
  fixture(async (ctx, network, watch) => {
    ctx.holdPublication = true;
    const q = new ControlledQuery(ctx, network);
    watch(q);
    await turns();
    network.finish(0, "A-generation-1");
    await turns();
    q.changePath("/B");
    await turns();
    network.finish(1, "B-generation-2");
    await turns();
    q.changePath("/A");
    await turns();
    expect(network.requests.length).toBe(3);
    ctx.publications[0].resolve();
    await turns();
    const afterOldA = {
      data: q.response?.data ?? null,
      fetching: q.isFetching,
    };
    ctx.publications[1].resolve();
    await turns();
    const afterB = { data: q.response?.data ?? null, fetching: q.isFetching };
    network.finish(2, "A-generation-3");
    await turns();
    ctx.publications[2].resolve();
    await turns();
    record(
      "rapid-A-B-A",
      { afterOldA, afterB, final: q.response?.data, key: q.cacheKey() },
      {
        afterOldA: { data: null, fetching: true },
        afterB: { data: null, fetching: true },
        final: "A-generation-3",
        key: "http://127.0.0.1:1/A",
      }
    );
  }));

it("positive cache age cannot reuse a fresh response from a replaced chain endpoint", async () =>
  fixture(async (ctx, network, watch) => {
    const store = new SettingsChainStore([chain("A")]);
    const q = new ControlledRestQuery(ctx, store, network);
    watch(q);
    await turns();
    network.finish(0, "endpoint-A");
    await turns();
    expect(q.response?.data).toBe("endpoint-A");
    store.replace("B");
    await turns();
    record(
      "chain-cacheMaxAge-after-switch",
      {
        data: q.response?.data ?? null,
        key: q.cacheKey(),
        requests: network.requests.map((request) => request.key),
        fetching: q.isFetching,
      },
      {
        data: null,
        key: "http://127.0.0.1:1/B/rest/node_info",
        requests: [
          "http://127.0.0.1:1/A/rest/node_info",
          "http://127.0.0.1:1/B/rest/node_info",
        ],
        fetching: true,
      }
    );
  }));

it("a dormant cached chain query refreshes on reuse but settings changes do no detached work", async () =>
  fixture(async (ctx, network, watch) => {
    const store = new SettingsChainStore([chain("A")]);
    const q = new ControlledRestQuery(ctx, store, network);
    const dispose = watch(q);
    await turns();
    network.finish(0, "cached-A");
    await turns();
    dispose();
    store.replace("B");
    await turns();
    expect(network.requests.length).toBe(1);
    const detachAgain = watch(q);
    await turns();
    const reused = {
      data: q.response?.data ?? null,
      key: q.cacheKey(),
      requests: network.requests.map((request) => request.key),
    };
    detachAgain();
    store.replace("A");
    await turns();
    record(
      "chain-detach-reuse",
      {
        reused,
        detachedRequests: network.requests.length,
        started: q.isStarted,
      },
      {
        reused: {
          data: null,
          key: "http://127.0.0.1:1/B/rest/node_info",
          requests: [
            "http://127.0.0.1:1/A/rest/node_info",
            "http://127.0.0.1:1/B/rest/node_info",
          ],
        },
        detachedRequests: 2,
        started: false,
      }
    );
  }));

it("unobserved waitResponse refreshes a populated response after endpoint replacement", async () =>
  fixture(async (ctx, network, watch, waitFor) => {
    const store = new SettingsChainStore([chain("A")]);
    const q = new ControlledRestQuery(ctx, store, network);
    const dispose = watch(q);
    await turns();
    network.finish(0, "cached-A");
    await turns();
    dispose();
    expect(q.isObserved).toBe(false);
    expect(q.response?.data).toBe("cached-A");
    store.replace("B");
    await turns();
    expect(network.requests.length).toBe(1);
    const waiting = waitFor(q);
    await turns();
    const beforeNewResponse = {
      settled: waiting.settled,
      data: q.response?.data ?? null,
      requests: network.requests.map((request) => request.key),
    };
    // Complete only work that waitResponse itself started, without introducing an observer.
    if (network.requests.length > 1) network.finish(1, "endpoint-B");
    await turns();
    expect(waiting.settled).toBe(true);
    expect(waiting.error).toBeUndefined();
    record(
      "unobserved-waitResponse-after-switch",
      {
        beforeNewResponse,
        returned: waiting.response?.data,
        observed: q.isObserved,
        started: q.isStarted,
      },
      {
        beforeNewResponse: {
          settled: false,
          data: null,
          requests: [
            "http://127.0.0.1:1/A/rest/node_info",
            "http://127.0.0.1:1/B/rest/node_info",
          ],
        },
        returned: "endpoint-B",
        observed: false,
        started: false,
      }
    );
  }));

it("held disk A from an earlier generation cannot satisfy a later A after A to B to A", async () =>
  fixture(async (ctx, network, watch) => {
    ctx.holdDisk = true;
    const q = new ControlledQuery(ctx, network, { cacheMaxAge: 60_000 });
    watch(q);
    await turns();
    q.changePath("/B");
    await turns();
    q.changePath("/A");
    await turns();
    expect(ctx.disk.map((item) => item.key)).toEqual([
      "http://127.0.0.1:1/A",
      "http://127.0.0.1:1/B",
      "http://127.0.0.1:1/A",
    ]);
    ctx.disk[0].gate.resolve({
      status: "fulfilled",
      value: diskResponse("disk-A-generation-1"),
    });
    await turns();
    const afterOldA = {
      data: q.response?.data ?? null,
      fetching: q.isFetching,
      hooks: [...q.received],
    };
    ctx.disk[2].gate.resolve({
      status: "fulfilled",
      value: diskResponse("disk-A-generation-3"),
    });
    await turns();
    record(
      "held-disk-A-B-A",
      {
        afterOldA,
        final: q.response?.data,
        hooks: q.received,
        fetching: q.isFetching,
        network: network.requests.length,
      },
      {
        afterOldA: { data: null, fetching: true, hooks: [] },
        final: "disk-A-generation-3",
        hooks: ["disk-A-generation-3"],
        fetching: false,
        network: 0,
      }
    );
  }));

it("direct disk prefetch remains available before a query is observed", async () =>
  fixture(async (ctx, network) => {
    class PrefetchQuery extends ControlledQuery {
      prefetch() {
        return this.loadStabledResponse();
      }
    }
    ctx.holdDisk = true;
    const q = new PrefetchQuery(ctx, network);
    const pending = q.prefetch();
    expect(q.isStarted).toBe(false);
    ctx.disk[0].gate.resolve({
      status: "fulfilled",
      value: diskResponse("prefetched-price"),
    });
    expect(await pending).toBe(true);
    expect(q.response?.data).toBe("prefetched-price");
    expect(q.received).toEqual(["prefetched-price"]);
    expect(q.isObserved).toBe(false);
    expect(network.requests).toHaveLength(0);
  }));

it("old async startup cannot fetch before the reused query finishes its new startup", async () =>
  fixture(async (ctx, network, watch) => {
    class SlowStartQuery extends ControlledRestQuery {
      readonly starts: Deferred<void>[] = [];
      protected override onStart(): Promise<void> {
        const gate = new Deferred<void>();
        this.starts.push(gate);
        return gate.promise;
      }
    }
    const store = new SettingsChainStore([chain("A")]);
    const q = new SlowStartQuery(ctx, store, network);
    try {
      const detach = watch(q);
      await turns();
      expect(q.starts).toHaveLength(1);
      detach();
      store.replace("B");
      watch(q);
      await turns();
      q.starts[0].resolve();
      await turns();
      expect(q.starts).toHaveLength(2);
      expect(network.requests).toHaveLength(0);
      expect(q.isFetching).toBe(true);
      q.starts[1].resolve();
      await turns();
      expect(network.requests.map((request) => request.key)).toEqual([
        "http://127.0.0.1:1/B/rest/node_info",
      ]);
      network.finish(0, "initialized-B");
      await turns();
      expect(q.response?.data).toBe("initialized-B");
    } finally {
      for (let i = 0; i < 4; i++) {
        q.starts.forEach((gate) => gate.resolve());
        await turns();
      }
    }
  }));

it("waitResponse inside the endpoint-changing action starts replacement work", async () =>
  fixture(async (ctx, network, watch, waitFor) => {
    const store = new SettingsChainStore([chain("A")]);
    const q = new ControlledRestQuery(ctx, store, network);
    watch(q);
    await turns();
    expect(network.requests).toHaveLength(1);
    let waiting!: WaitState;
    runInAction(() => {
      store.replace("B");
      waiting = waitFor(q);
    });
    await turns();
    expect(waiting.settled).toBe(false);
    expect(network.requests.map((request) => request.key)).toEqual([
      "http://127.0.0.1:1/A/rest/node_info",
      "http://127.0.0.1:1/B/rest/node_info",
    ]);
    network.finish(1, "endpoint-B");
    await turns();
    expect(waiting.settled).toBe(true);
    expect(waiting.error).toBeUndefined();
    expect(waiting.response?.data).toBe("endpoint-B");
    network.finish(0, "late-A");
    await turns();
    expect(q.response?.data).toBe("endpoint-B");
  }));
