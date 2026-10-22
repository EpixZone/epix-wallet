import type { KVStore } from "@keplr-wallet/common";
import { webcrypto } from "crypto";
import {
  EndpointHealthCoordinator,
  EndpointHealthSnapshot,
  PreferredEndpoints,
} from "./endpoint-health";
import { ENDPOINT_INVENTORY, EndpointTuple } from "./endpoint-health-inventory";

class MemoryStore implements KVStore {
  data = new Map<string, unknown>();
  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  set = jest.fn(async <T>(key: string, value: T | null) => {
    this.data.set(key, JSON.parse(JSON.stringify(value)));
  });
  prefix() {
    return "health";
  }
}
const defaults = ENDPOINT_INVENTORY[0].profiles[0].endpoints;
const backup = ENDPOINT_INVENTORY[0].profiles[1].endpoints;
const custom: EndpointTuple = {
  rpc: "https://private.test/rpc",
  rest: "https://private.test/rest",
  evmRpc: "https://private.test/evm",
};
const json = (data: unknown) => new Response(JSON.stringify(data));
function fixture(manual = false) {
  let now = 1_792_660_000_000;
  let preferred: PreferredEndpoints | undefined = {
    chainId: "epix_1916-1",
    endpoints: manual ? custom : defaults,
    manual,
  };
  const store = new MemoryStore();
  const changes: EndpointHealthSnapshot[] = [];
  let fail = (_url: string) => false;
  let held:
    | ((url: string, init?: RequestInit) => Promise<Response> | undefined)
    | undefined;
  const getPreferred = jest.fn((chainId: string) =>
    preferred?.chainId === chainId ? preferred : undefined
  );
  const fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const wait = held?.(url, init);
      if (wait) return wait;
      if (fail(url)) return new Response("Unavailable", { status: 503 });
      const time = new Date(now - 1000).toISOString();
      if (init?.body) {
        const request = JSON.parse(init.body as string);
        const results: Record<string, unknown> = {
          eth_chainId: "0x77c",
          eth_syncing: false,
          eth_getBlockByNumber: {
            number: "0x64",
            timestamp: `0x${Math.floor(now / 1000).toString(16)}`,
          },
        };
        return json({
          jsonrpc: "2.0",
          id: request.id,
          result: results[request.method],
        });
      }
      if (url.endsWith("/status"))
        return json({
          result: {
            node_info: { network: "epix_1916-1" },
            sync_info: {
              catching_up: false,
              latest_block_height: "100",
              latest_block_time: time,
            },
          },
        });
      if (url.endsWith("/node_info"))
        return json({ default_node_info: { network: "epix_1916-1" } });
      return json({
        block: { header: { chain_id: "epix_1916-1", height: "100", time } },
      });
    }
  );
  const create = (epoch = "worker-1") =>
    new EndpointHealthCoordinator({
      kvStore: store,
      getPreferred,
      onChange: (snapshot) => changes.push(snapshot),
      now: () => now,
      fetch,
      workerEpoch: epoch,
    });
  return {
    store,
    fetch,
    getPreferred,
    changes,
    create,
    advance: (ms: number) => {
      now += ms;
    },
    fail: (fn: (url: string) => boolean) => {
      fail = fn;
    },
    hold: (fn: typeof held) => {
      held = fn;
    },
    prefer: (value: typeof preferred) => {
      preferred = value;
    },
  };
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Expected async probe boundary was not reached");
}
const isDefault = (url: string) =>
  Object.values(defaults).some((base) => url.startsWith(base));

it("uses secure worker epochs by default and preserves explicit test epochs", async () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto"
  );
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
    });
  }
  const randomUUID = jest
    .spyOn(globalThis.crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
  const f = fixture();
  const create = (workerEpoch?: string) =>
    new EndpointHealthCoordinator({
      kvStore: f.store,
      getPreferred: f.getPreferred,
      onChange: () => undefined,
      fetch: f.fetch,
      workerEpoch,
    });
  const workers: EndpointHealthCoordinator[] = [];
  try {
    workers.push(create(), create(), create("test-worker"));
    await Promise.all(workers.map((worker) => worker.init()));
    expect(
      workers.map((worker) => worker.getSnapshot("epix_1916-1")?.workerEpoch)
    ).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "test-worker",
    ]);
    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(f.fetch).not.toHaveBeenCalled();
  } finally {
    workers.forEach((worker) => worker.dispose());
    randomUUID.mockRestore();
    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "crypto");
    }
  }
});

it("initializes without network and keeps all snapshot getters side-effect free and immutable", async () => {
  const f = fixture();
  const health = f.create();
  expect(health.getSnapshot("epix_1916-1")).toBeUndefined();
  await health.init();
  expect(f.fetch).not.toHaveBeenCalled();
  const counts = [
    f.getPreferred.mock.calls.length,
    f.store.set.mock.calls.length,
    f.changes.length,
  ];
  const first = health.getSnapshot("epix_1916-1")!;
  for (let i = 0; i < 3; i++) {
    health.getSnapshots();
    health.getEffectiveEndpoints("epix_1916-1");
  }
  expect([
    f.getPreferred.mock.calls.length,
    f.store.set.mock.calls.length,
    f.changes.length,
  ]).toEqual(counts);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.preferred)).toBe(true);
  expect(Object.isFrozen(first.capabilities)).toBe(true);
  expect(await health.check("epix_1916-2", "connect")).toBeUndefined();
  expect(await health.check("eip155:1916", "connect")).toBeUndefined();
  expect(f.fetch).not.toHaveBeenCalled();
});

it.each(["connect", "manual"] as const)(
  "recovers an unavailable default in the first %s check without overwriting preference",
  async (reason) => {
    const f = fixture();
    f.fail(isDefault);
    const health = f.create();
    const snapshot = (await health.check("epix_1916-1", reason))!;
    expect(snapshot.status).toBe("backup");
    expect(snapshot.preferred).toEqual(defaults);
    expect(snapshot.effective).toEqual(backup);
    expect(snapshot.generation).toBe(1);
    const requests = f.fetch.mock.calls.length;
    await health.check("epix_1916-1", "connect");
    expect(f.fetch).toHaveBeenCalledTimes(requests);
  }
);

it("requires two automatic failures and does not probe backups while preferred is healthy", async () => {
  const f = fixture();
  const health = f.create();
  expect((await health.check("epix_1916-1", "automatic"))?.status).toBe(
    "healthy"
  );
  expect(f.fetch.mock.calls.every((call) => isDefault(String(call[0])))).toBe(
    true
  );
  f.fail(isDefault);
  f.advance(60000);
  f.fetch.mockClear();
  expect((await health.check("epix_1916-1", "automatic"))?.status).toBe(
    "unavailable"
  );
  expect(f.fetch.mock.calls.every((call) => isDefault(String(call[0])))).toBe(
    true
  );
  f.advance(60000);
  expect((await health.check("epix_1916-1", "automatic"))?.effective).toEqual(
    backup
  );
});

it("never probes public backups for a custom preference without tuple-bound consent", async () => {
  const f = fixture(true);
  f.fail(() => true);
  const health = f.create();
  for (const reason of ["automatic", "connect", "manual"] as const) {
    await health.check("epix_1916-1", reason);
    f.advance(60000);
  }
  expect(
    f.fetch.mock.calls.every((call) =>
      String(call[0]).startsWith("https://private.test/")
    )
  ).toBe(true);
  f.fail((url) => url.startsWith("https://private.test/"));
  await health.setPublicFallback("epix_1916-1", true);
  expect((await health.check("epix_1916-1", "manual"))?.status).toBe("backup");
  const changed = { ...custom, rest: "https://different-private.test/rest" };
  f.prefer({ chainId: "epix_1916-1", endpoints: changed, manual: true });
  const persistence = health.preferencesChanged("epix_1916-1");
  expect(health.getSnapshot("epix_1916-1")).toMatchObject({
    effective: changed,
    publicFallback: false,
    status: "unknown",
  });
  await persistence;
});

it("coalesces simultaneous requests and bounds probes to two concurrent capabilities", async () => {
  const f = fixture();
  const health = f.create();
  let active = 0;
  let maximum = 0;
  const releases: (() => void)[] = [];
  f.hold((_url, init) => {
    active++;
    maximum = Math.max(maximum, active);
    return new Promise<Response>((resolve) => {
      const finish = () => {
        active--;
        resolve(new Response("down", { status: 503 }));
      };
      releases.push(finish);
      init?.signal?.addEventListener("abort", finish, { once: true });
    });
  });
  const a = health.check("epix_1916-1", "automatic");
  const b = health.check("epix_1916-1", "automatic");
  await until(() => releases.length === 2);
  releases.splice(0).forEach((release) => release());
  await until(() => releases.length === 1);
  releases.splice(0).forEach((release) => release());
  const snapshots = await Promise.all([a, b]);
  expect(snapshots[0]).toBe(snapshots[1]);
  expect(f.fetch).toHaveBeenCalledTimes(3);
  expect(maximum).toBe(2);
});

it("fences a delayed fetch after manual edits and does not restore old endpoints", async () => {
  const f = fixture();
  const health = f.create();
  let signal: AbortSignal | undefined;
  f.hold((_url, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise(() => undefined);
  });
  const pending = health.check("epix_1916-1", "manual");
  await until(() => !!signal);
  f.prefer({ chainId: "epix_1916-1", endpoints: custom, manual: true });
  const change = health.preferencesChanged("epix_1916-1");
  expect(signal?.aborted).toBe(true);
  expect(health.getEffectiveEndpoints("epix_1916-1")).toEqual(custom);
  await change;
  await pending;
  expect(health.getSnapshot("epix_1916-1")).toMatchObject({
    effective: custom,
    publicFallback: false,
    status: "unknown",
  });
});

it("withdrawal aborts a public probe and immediately restores a custom preference", async () => {
  const f = fixture(true);
  f.fail((url) => url.startsWith("https://private.test/"));
  const health = f.create();
  await health.init();
  await health.setPublicFallback("epix_1916-1", true);
  let held = false;
  f.hold((url) => {
    if (!url.startsWith("https://private.test/")) {
      held = true;
      return new Promise(() => undefined);
    }
    return undefined;
  });
  const pending = health.check("epix_1916-1", "manual");
  await until(() => held);
  const withdrawing = health.setPublicFallback("epix_1916-1", false);
  expect(health.getSnapshot("epix_1916-1")).toMatchObject({
    publicFallback: false,
    effective: custom,
  });
  await withdrawing;
  await pending;
  expect(health.getSnapshot("epix_1916-1")?.status).toBe("unknown");
});

it("preserves healthy Cosmos services during an EVM-only outage", async () => {
  const f = fixture();
  f.fail((url) => url.includes("evm"));
  const health = f.create();
  const result = (await health.check("epix_1916-1", "connect"))!;
  expect(result.status).toBe("degraded");
  expect(result.effective).toEqual(defaults);
  expect(result.capabilities.rpc.status).toBe("healthy");
  expect(result.capabilities.rest.status).toBe("healthy");
  expect(result.capabilities.evmRpc?.status).toBe("unavailable");
});

it("restores preferred only after three good checks and five minutes on healthy backup", async () => {
  const f = fixture();
  f.fail(isDefault);
  const health = f.create();
  await health.check("epix_1916-1", "connect");
  f.fail(() => false);
  for (let i = 0; i < 3; i++) {
    f.advance(60000);
    expect((await health.check("epix_1916-1", "manual"))?.status).toBe(
      "backup"
    );
  }
  f.advance(120000);
  const restored = (await health.check("epix_1916-1", "automatic"))!;
  expect(restored.status).toBe("healthy");
  expect(restored.effective).toEqual(defaults);
  expect(restored.generation).toBe(2);
  f.advance(60000);
  expect((await health.check("epix_1916-1", "automatic"))?.generation).toBe(2);
});

it("restores matching persisted selection as unverified and rejects it after a preference change", async () => {
  const f = fixture(true);
  f.fail((url) => url.startsWith("https://private.test/"));
  const first = f.create();
  await first.init();
  await first.setPublicFallback("epix_1916-1", true);
  await first.check("epix_1916-1", "manual");
  first.dispose();
  const second = f.create("worker-2");
  await second.init();
  expect(second.getSnapshot("epix_1916-1")).toMatchObject({
    status: "unknown",
    workerEpoch: "worker-2",
    publicFallback: true,
    effective: defaults,
    capabilities: { rpc: { status: "unknown" } },
  });
  const requests = f.fetch.mock.calls.length;
  await second.checkDue();
  expect(f.fetch).toHaveBeenCalledTimes(requests);
  second.dispose();
  f.prefer({
    chainId: "epix_1916-1",
    endpoints: { ...custom, rest: "https://new.test" },
    manual: true,
  });
  const third = f.create("worker-3");
  await third.init();
  expect(third.getSnapshot("epix_1916-1")).toMatchObject({
    publicFallback: false,
    effective: { rest: "https://new.test" },
  });
});

it("disposal settles held probes and prevents late notifications or new network work", async () => {
  const f = fixture();
  const health = f.create();
  f.hold(() => new Promise(() => undefined));
  const pending = health.check("epix_1916-1", "connect");
  await until(() => f.fetch.mock.calls.length === 2);
  const notifications = f.changes.length;
  const requests = f.fetch.mock.calls.length;
  health.dispose();
  await pending;
  await health.checkDue();
  await health.check("epix_1916-1", "manual");
  expect(f.changes).toHaveLength(notifications);
  expect(f.fetch).toHaveBeenCalledTimes(requests);
});

it("withdrawal supersedes an opt-in waiting for storage, without any public probing", async () => {
  const f = fixture(true);
  const health = f.create();
  await health.init();
  let release: (() => void) | undefined;
  f.store.set.mockImplementationOnce(async (key, value) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    f.store.data.set(key, value);
  });
  const enabling = health.setPublicFallback("epix_1916-1", true);
  await until(() => !!release);
  await health.check("epix_1916-1", "manual");
  expect(f.fetch).not.toHaveBeenCalled();
  const disabling = health.setPublicFallback("epix_1916-1", false);
  expect(health.getSnapshot("epix_1916-1")?.publicFallback).toBe(false);
  release!();
  await enabling;
  await disabling;
  expect(health.getSnapshot("epix_1916-1")?.publicFallback).toBe(false);
  const restart = f.create("worker-2");
  await restart.init();
  expect(restart.getSnapshot("epix_1916-1")?.publicFallback).toBe(false);
});

it("does not inherit pending consent across a changed preference or a failed write", async () => {
  const f = fixture(true);
  const health = f.create();
  await health.init();
  let release: (() => void) | undefined;
  f.store.set.mockImplementationOnce(async (key, value) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    f.store.data.set(key, value);
  });
  const enabling = health.setPublicFallback("epix_1916-1", true);
  await until(() => !!release);
  f.prefer({
    chainId: "epix_1916-1",
    endpoints: { ...custom, rpc: "https://new-private.test" },
    manual: true,
  });
  const editing = health.preferencesChanged("epix_1916-1");
  release!();
  await enabling;
  await editing;
  expect(health.getSnapshot("epix_1916-1")?.publicFallback).toBe(false);
  f.store.set.mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(health.setPublicFallback("epix_1916-1", true)).rejects.toThrow(
    "storage unavailable"
  );
  expect(health.getSnapshot("epix_1916-1")?.publicFallback).toBe(false);
  expect(f.fetch).not.toHaveBeenCalled();
  const restart = f.create("worker-2");
  await restart.init();
  expect(restart.getSnapshot("epix_1916-1")?.publicFallback).toBe(false);
});

it("keeps revisions monotonic when a chain is removed and re-added", async () => {
  const f = fixture();
  const health = f.create();
  const before = (await health.check("epix_1916-1", "connect"))!;
  f.prefer(undefined);
  await health.preferencesChanged();
  expect(health.getSnapshot("epix_1916-1")).toBeUndefined();
  f.prefer({ chainId: "epix_1916-1", endpoints: defaults, manual: false });
  await health.preferencesChanged();
  expect(health.getSnapshot("epix_1916-1")!.revision).toBeGreaterThan(
    before.revision
  );
  expect(health.getSnapshot("epix_1916-1")!.generation).toBeGreaterThan(
    before.generation
  );
});

it("disqualifies wrong-chain RPC immediately even on the first automatic pass", async () => {
  const f = fixture();
  const health = f.create();
  f.hold((url) =>
    url === defaults.rpc + "/status"
      ? Promise.resolve(
          json({
            result: {
              node_info: { network: "epix_1916-2" },
              sync_info: {
                catching_up: false,
                latest_block_height: "100",
                latest_block_time: new Date(1_792_660_000_000).toISOString(),
              },
            },
          })
        )
      : undefined
  );
  const result = (await health.check("epix_1916-1", "automatic"))!;
  expect(result.status).toBe("backup");
  expect(result.effective).toEqual({ ...defaults, rpc: backup.rpc });
});

it("replaces a clearly lagging REST service while retaining the healthy RPC", async () => {
  const f = fixture();
  const health = f.create();
  f.hold((url) =>
    url === defaults.rest + "/cosmos/base/tendermint/v1beta1/blocks/latest"
      ? Promise.resolve(
          json({
            block: {
              header: {
                chain_id: "epix_1916-1",
                height: "70",
                time: new Date(1_792_660_000_000 - 40000).toISOString(),
              },
            },
          })
        )
      : undefined
  );
  const result = (await health.check("epix_1916-1", "connect"))!;
  expect(result.status).toBe("backup");
  expect(result.effective).toEqual({ ...defaults, rest: backup.rest });
});

it("uses the Osmosis inventory without adding an EVM service", async () => {
  const f = fixture();
  const health = f.create();
  const osmosis = ENDPOINT_INVENTORY[1];
  f.prefer({
    chainId: "osmosis-1",
    endpoints: osmosis.profiles[0].endpoints,
    manual: false,
  });
  f.fail((url) =>
    Object.values(osmosis.profiles[0].endpoints).some((base) =>
      url.startsWith(base)
    )
  );
  f.hold((url) => {
    if (
      Object.values(osmosis.profiles[0].endpoints).some((base) =>
        url.startsWith(base)
      )
    )
      return undefined;
    const time = new Date(1_792_660_000_000).toISOString();
    return Promise.resolve(
      json(
        url.endsWith("/status")
          ? {
              result: {
                node_info: { network: "osmosis-1" },
                sync_info: {
                  catching_up: false,
                  latest_block_height: "100",
                  latest_block_time: time,
                },
              },
            }
          : url.endsWith("/node_info")
          ? { default_node_info: { network: "osmosis-1" } }
          : {
              block: { header: { chain_id: "osmosis-1", height: "100", time } },
            }
      )
    );
  });
  const result = (await health.check("osmosis-1", "connect"))!;
  expect(result.status).toBe("backup");
  expect(result.effective).toEqual(osmosis.profiles[1].endpoints);
  expect(result.capabilities.evmRpc).toBeUndefined();
  expect(f.fetch.mock.calls.every((call) => call[1]?.body === undefined)).toBe(
    true
  );
});

it("keeps privacy consent after recovery history expires, including explicit default opt-out", async () => {
  const f = fixture();
  const first = f.create();
  await first.init();
  await first.setPublicFallback("epix_1916-1", false);
  first.dispose();
  f.advance(25 * 60 * 60 * 1000);
  f.fail(isDefault);
  const second = f.create("worker-2");
  await second.init();
  expect(second.getSnapshot("epix_1916-1")).toMatchObject({
    publicFallback: false,
    effective: defaults,
    nextDueAt: 0,
  });
  await second.check("epix_1916-1", "manual");
  expect(f.fetch.mock.calls.every((call) => isDefault(String(call[0])))).toBe(
    true
  );
  const customFixture = fixture(true);
  const optedIn = customFixture.create();
  await optedIn.init();
  await optedIn.setPublicFallback("epix_1916-1", true);
  optedIn.dispose();
  customFixture.advance(25 * 60 * 60 * 1000);
  const resumed = customFixture.create("worker-2");
  await resumed.init();
  expect(resumed.getSnapshot("epix_1916-1")).toMatchObject({
    publicFallback: true,
    effective: custom,
    status: "unknown",
  });
});

it("retries initialization after storage recovery without probing before persisted opt-out is loaded", async () => {
  const f = fixture();
  const previous = f.create();
  await previous.init();
  await previous.setPublicFallback("epix_1916-1", false);
  previous.dispose();
  const health = f.create("worker-2");
  jest
    .spyOn(f.store, "get")
    .mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(health.check("epix_1916-1", "connect")).rejects.toThrow(
    "storage unavailable"
  );
  expect(f.fetch).not.toHaveBeenCalled();
  f.fail(isDefault);
  const result = await health.check("epix_1916-1", "connect");
  expect(result).toMatchObject({
    publicFallback: false,
    effective: defaults,
    status: "unavailable",
  });
  expect(f.fetch.mock.calls.every((call) => isDefault(String(call[0])))).toBe(
    true
  );
});

it("allows one connect escalation after an automatic failed pass and keeps its cooldown across restart", async () => {
  const f = fixture();
  f.fail(isDefault);
  const health = f.create();
  expect((await health.check("epix_1916-1", "automatic"))?.status).toBe(
    "unavailable"
  );
  const result = (await health.check("epix_1916-1", "connect"))!;
  expect(result.status).toBe("backup");
  expect(result.effective).toEqual(backup);
  const requests = f.fetch.mock.calls.length;
  await Promise.all(
    Array.from({ length: 4 }, () => health.check("epix_1916-1", "connect"))
  );
  expect(f.fetch).toHaveBeenCalledTimes(requests);
  health.dispose();
  const resumed = f.create("worker-2");
  await resumed.init();
  await resumed.check("epix_1916-1", "connect");
  expect(f.fetch).toHaveBeenCalledTimes(requests);
  expect(resumed.getSnapshot("epix_1916-1")?.status).toBe("unknown");
});

it("coalesces connect escalation arriving while the automatic failure is waiting for storage", async () => {
  const f = fixture();
  f.fail(isDefault);
  const health = f.create();
  let release: (() => void) | undefined;
  f.store.set.mockImplementationOnce(async (key, value) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    f.store.data.set(key, value);
  });
  const automatic = health.check("epix_1916-1", "automatic");
  await until(() => !!release);
  expect(health.getSnapshot("epix_1916-1")?.status).toBe("unavailable");
  const connect = health.check("epix_1916-1", "connect");
  const duplicate = health.check("epix_1916-1", "connect");
  release!();
  await automatic;
  const results = await Promise.all([connect, duplicate]);
  expect(results[0]?.status).toBe("backup");
  expect(results[0]).toBe(results[1]);
  expect(
    f.changes.filter((snapshot) => snapshot.status === "backup")
  ).toHaveLength(1);
  expect(f.fetch).toHaveBeenCalledTimes(12);
  const requests = f.fetch.mock.calls.length;
  await health.check("epix_1916-1", "connect");
  expect(f.fetch).toHaveBeenCalledTimes(requests);
});

it("requires public approval for connect escalation and consumes an unsuccessful escalation too", async () => {
  const privateFixture = fixture(true);
  privateFixture.fail(() => true);
  const privateHealth = privateFixture.create();
  await privateHealth.check("epix_1916-1", "automatic");
  const privateRequests = privateFixture.fetch.mock.calls.length;
  await privateHealth.check("epix_1916-1", "connect");
  expect(privateFixture.fetch).toHaveBeenCalledTimes(privateRequests);
  expect(
    privateFixture.fetch.mock.calls.every((call) =>
      String(call[0]).startsWith("https://private.test/")
    )
  ).toBe(true);
  const f = fixture();
  f.fail(() => true);
  const health = f.create();
  await health.check("epix_1916-1", "automatic");
  await health.check("epix_1916-1", "connect");
  const requests = f.fetch.mock.calls.length;
  expect(requests).toBe(12);
  await health.check("epix_1916-1", "connect");
  expect(f.fetch).toHaveBeenCalledTimes(requests);
  health.dispose();
  const restart = f.create("worker-2");
  await restart.init();
  await restart.check("epix_1916-1", "connect");
  expect(f.fetch).toHaveBeenCalledTimes(requests);
});

it("does not launch a queued connect follow-up for a superseded preference", async () => {
  const f = fixture();
  f.fail(isDefault);
  const health = f.create();
  let release: (() => void) | undefined;
  f.store.set.mockImplementationOnce(async (key, value) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    f.store.data.set(key, value);
  });
  const automatic = health.check("epix_1916-1", "automatic");
  await until(() => !!release);
  const connect = health.check("epix_1916-1", "connect");
  await Promise.resolve();
  f.prefer({ chainId: "epix_1916-1", endpoints: custom, manual: true });
  const changed = health.preferencesChanged("epix_1916-1");
  release!();
  await Promise.all([automatic, connect, changed]);
  expect(f.fetch).toHaveBeenCalledTimes(3);
  expect(health.getSnapshot("epix_1916-1")).toMatchObject({
    status: "unknown",
    effective: custom,
    publicFallback: false,
  });
});

it("does not probe or leave a checking status if consuming escalation cannot be persisted", async () => {
  const f = fixture();
  f.fail(isDefault);
  const health = f.create();
  await health.check("epix_1916-1", "automatic");
  const requests = f.fetch.mock.calls.length;
  f.store.set.mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(health.check("epix_1916-1", "connect")).rejects.toThrow(
    "storage unavailable"
  );
  expect(f.fetch).toHaveBeenCalledTimes(requests);
  expect(health.getSnapshot("epix_1916-1")?.status).toBe("unavailable");
});
