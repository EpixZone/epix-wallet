import type { KVStore } from "@keplr-wallet/common";
import {
  ENDPOINT_INVENTORY,
  EndpointTuple,
  getEndpointInventory,
} from "./endpoint-health-inventory";
import {
  checkCosmosProfileLag,
  EndpointCapability,
  EndpointCapabilityHealth,
  ENDPOINT_RECEIPT_TTL,
  probeEndpoint,
} from "./endpoint-health-probe";

export type { EndpointTuple } from "./endpoint-health-inventory";
export type {
  EndpointCapability,
  EndpointCapabilityHealth,
} from "./endpoint-health-probe";
export type EndpointCheckReason = "automatic" | "manual" | "connect";

export interface PreferredEndpoints {
  readonly chainId: string;
  readonly endpoints: EndpointTuple;
  readonly manual: boolean;
}

export interface EndpointHealthSnapshot {
  readonly chainId: string;
  readonly preferred: EndpointTuple;
  readonly effective: EndpointTuple;
  readonly manual: boolean;
  readonly publicFallback: boolean;
  readonly capabilities: Readonly<{
    rpc: EndpointCapabilityHealth;
    rest: EndpointCapabilityHealth;
    evmRpc?: EndpointCapabilityHealth;
  }>;
  readonly status:
    | "unknown"
    | "checking"
    | "healthy"
    | "backup"
    | "degraded"
    | "unavailable";
  readonly checkedAt?: number;
  readonly nextDueAt: number;
  readonly lastSwitchAt?: number;
  readonly generation: number;
  readonly revision: number;
  readonly workerEpoch: string;
}

export interface EndpointHealthOptions {
  readonly kvStore: KVStore;
  readonly getPreferred: (chainId: string) => PreferredEndpoints | undefined;
  readonly onChange: (snapshot: EndpointHealthSnapshot) => void;
  readonly now?: () => number;
  readonly fetch?: typeof fetch;
  readonly workerEpoch?: string;
}

const NORMAL_INTERVAL = 60_000;
const MAX_BACKOFF = 5 * NORMAL_INTERVAL;
const RESTORE_RESIDENCE = 5 * NORMAL_INTERVAL;
const HISTORY_TTL = 24 * 60 * NORMAL_INTERVAL;
const CAPS: readonly EndpointCapability[] = ["rpc", "rest", "evmRpc"];
type Counts = Record<EndpointCapability, number>;
interface HealthRecord {
  snapshot: EndpointHealthSnapshot;
  fingerprint: string;
  token: number;
  failures: Counts;
  successes: Counts;
  failedPasses: number;
  consentPending?: boolean;
  connectRecoveryAvailable: boolean;
}
interface Flight {
  token: number;
  controller: AbortController;
  immediateRecovery: boolean;
  consumeConnectRecovery: boolean;
  phase: "probing" | "persisting";
  followup?: Promise<EndpointHealthSnapshot | undefined>;
  promise: Promise<EndpointHealthSnapshot | undefined>;
}
interface StoredRecord {
  chainId: string;
  fingerprint: string;
  publicFallback: boolean;
  effective: EndpointTuple;
  updatedAt: number;
  nextDueAt: number;
  lastSwitchAt?: number;
  connectRecoveryAvailable: boolean;
}
const counts = (): Counts => ({ rpc: 0, rest: 0, evmRpc: 0 });
const fingerprint = (value: PreferredEndpoints) =>
  JSON.stringify([
    value.chainId,
    value.manual,
    value.endpoints.rpc,
    value.endpoints.rest,
    value.endpoints.evmRpc,
  ]);
const copyTuple = (value: EndpointTuple): EndpointTuple =>
  Object.freeze({
    rpc: value.rpc,
    rest: value.rest,
    ...(value.evmRpc ? { evmRpc: value.evmRpc } : {}),
  });
const sameTuple = (a: EndpointTuple, b: EndpointTuple) =>
  CAPS.every((capability) => a[capability] === b[capability]);
function unknown(endpoint: string): EndpointCapabilityHealth {
  return Object.freeze({ endpoint, status: "unknown" });
}
function unknownCapabilities(
  endpoints: EndpointTuple
): EndpointHealthSnapshot["capabilities"] {
  return Object.freeze({
    rpc: unknown(endpoints.rpc),
    rest: unknown(endpoints.rest),
    ...(endpoints.evmRpc ? { evmRpc: unknown(endpoints.evmRpc) } : {}),
  });
}
function validTuple(value: EndpointTuple): boolean {
  return (
    !!value &&
    [value.rpc, value.rest].every(
      (url) => typeof url === "string" && url.length > 0 && url.length <= 8192
    ) &&
    (value.evmRpc === undefined ||
      (typeof value.evmRpc === "string" &&
        value.evmRpc.length > 0 &&
        value.evmRpc.length <= 8192))
  );
}

export class EndpointHealthCoordinator {
  private readonly records = new Map<string, HealthRecord>();
  private readonly flights = new Map<string, Flight>();
  private readonly now: () => number;
  private readonly fetch: typeof fetch;
  private readonly epoch: string;
  private initialized = false;
  private initialization?: Promise<void>;
  private disposed = false;
  private token = 0;
  private revision = 0;
  private readonly generations = new Map<string, number>();
  private persistence: Promise<void> = Promise.resolve();

  constructor(private readonly options: EndpointHealthOptions) {
    this.now = options.now ?? Date.now;
    this.fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.epoch =
      options.workerEpoch ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  init(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.initialization) {
      const pending = this.initialize();
      this.initialization = pending;
      void pending.catch(() => {
        if (this.initialization === pending) this.initialization = undefined;
      });
    }
    return this.initialization;
  }

  private async initialize(): Promise<void> {
    const stored = await this.options.kvStore.get<{
      version?: unknown;
      records?: unknown;
    }>("v1");
    if (this.disposed) return;
    const history =
      stored?.version === 1 &&
      Array.isArray(stored.records) &&
      stored.records.length <= 2
        ? stored.records
        : [];
    for (const inventory of ENDPOINT_INVENTORY) {
      const record = this.reconcile(inventory.chainId, false);
      if (!record) continue;
      const saved = history.find(
        (value) =>
          value &&
          typeof value === "object" &&
          value.chainId === inventory.chainId
      ) as StoredRecord | undefined;
      if (
        saved &&
        saved.fingerprint === record.fingerprint &&
        typeof saved.publicFallback === "boolean"
      ) {
        // Privacy choices are tuple-bound, not time-limited. Only transient
        // recovery history expires; expiration must never re-enable probing.
        const freshHistory =
          Number.isFinite(saved.updatedAt) &&
          saved.updatedAt <= this.now() &&
          this.now() - saved.updatedAt <= HISTORY_TTL;
        const preferred = record.snapshot.preferred;
        const allowed = (capability: EndpointCapability, url: unknown) =>
          url === preferred[capability] ||
          (saved.publicFallback &&
            typeof url === "string" &&
            inventory.profiles.some(
              (profile) => profile.endpoints[capability] === url
            ));
        const effective =
          freshHistory &&
          validTuple(saved.effective) &&
          CAPS.every((capability) =>
            allowed(capability, saved.effective[capability])
          ) &&
          !!saved.effective.evmRpc === !!preferred.evmRpc
            ? copyTuple(saved.effective)
            : preferred;
        record.connectRecoveryAvailable =
          freshHistory &&
          saved.publicFallback &&
          saved.connectRecoveryAvailable === true;
        record.snapshot = Object.freeze({
          ...record.snapshot,
          publicFallback: saved.publicFallback,
          effective,
          capabilities: unknownCapabilities(effective),
          // Preserve bounded due times across worker restarts, without treating
          // any stored receipt as a fresh verification.
          nextDueAt:
            freshHistory && Number.isFinite(saved.nextDueAt)
              ? Math.max(0, Math.min(saved.nextDueAt, this.now() + MAX_BACKOFF))
              : 0,
          lastSwitchAt:
            freshHistory &&
            Number.isFinite(saved.lastSwitchAt) &&
            saved.lastSwitchAt! >= 0 &&
            saved.lastSwitchAt! <= this.now()
              ? saved.lastSwitchAt
              : undefined,
        });
      }
      this.notify(record.snapshot);
    }
    this.initialized = true;
  }

  getSnapshot(chainId: string): EndpointHealthSnapshot | undefined {
    return this.records.get(chainId)?.snapshot;
  }

  getSnapshots(): readonly EndpointHealthSnapshot[] {
    return Object.freeze(
      Array.from(this.records.values(), (record) => record.snapshot)
    );
  }

  getEffectiveEndpoints(chainId: string): EndpointTuple | undefined {
    return this.records.get(chainId)?.snapshot.effective;
  }

  private reconcile(chainId: string, notify = true): HealthRecord | undefined {
    const old = this.records.get(chainId);
    const inventory = getEndpointInventory(chainId);
    const value = inventory ? this.options.getPreferred(chainId) : undefined;
    if (
      !value ||
      value.chainId !== chainId ||
      !validTuple(value.endpoints) ||
      (!inventory?.evmChainId && value.endpoints.evmRpc)
    ) {
      if (old) {
        this.flights.get(chainId)?.controller.abort();
        this.generations.set(chainId, old.snapshot.generation + 1);
        this.records.delete(chainId);
      }
      return undefined;
    }
    const key = fingerprint(value);
    if (old?.fingerprint === key) return old;
    this.flights.get(chainId)?.controller.abort();
    const endpoints = copyTuple(value.endpoints);
    const record: HealthRecord = {
      fingerprint: key,
      token: ++this.token,
      failures: counts(),
      successes: counts(),
      failedPasses: 0,
      connectRecoveryAvailable: false,
      snapshot: Object.freeze({
        chainId,
        preferred: endpoints,
        effective: endpoints,
        manual: value.manual,
        publicFallback: !value.manual,
        capabilities: unknownCapabilities(endpoints),
        status: "unknown",
        nextDueAt: 0,
        generation: old
          ? old.snapshot.generation +
            Number(!sameTuple(old.snapshot.effective, endpoints))
          : this.generations.get(chainId) ?? 0,
        revision: ++this.revision,
        workerEpoch: this.epoch,
      }),
    };
    this.records.set(chainId, record);
    if (notify) this.notify(record.snapshot);
    return record;
  }

  async preferencesChanged(chainId?: string): Promise<void> {
    if (this.disposed) return;
    if (!this.initialized) {
      await this.init();
      if (this.disposed) return;
    }
    const keys =
      chainId === undefined
        ? ENDPOINT_INVENTORY.map((value) => value.chainId)
        : [chainId];
    let changed = false;
    for (const key of keys) {
      const before = this.records.get(key);
      changed = this.reconcile(key) !== before || changed;
    }
    if (changed) await this.persist();
  }

  async setPublicFallback(
    chainId: string,
    enabled: boolean
  ): Promise<EndpointHealthSnapshot | undefined> {
    if (this.disposed) return this.getSnapshot(chainId);
    if (!this.initialized) await this.init();
    if (this.disposed) return this.getSnapshot(chainId);
    const record = this.reconcile(chainId);
    if (
      !record ||
      (record.snapshot.publicFallback === enabled &&
        record.consentPending === undefined)
    )
      return record?.snapshot;
    this.flights.get(chainId)?.controller.abort();
    record.token = ++this.token;
    const token = record.token;
    record.consentPending = undefined;
    record.connectRecoveryAvailable = false;
    if (!enabled) {
      record.failures = counts();
      record.successes = counts();
      this.publish(record, {
        publicFallback: false,
        effective: record.snapshot.preferred,
        capabilities: unknownCapabilities(record.snapshot.preferred),
        status: "unknown",
        checkedAt: undefined,
        nextDueAt: 0,
      });
      await this.persist();
    } else {
      // Keep the pending intent in every serialized write, but expose no
      // consent to probes until the write completes. Withdrawal supersedes it.
      record.consentPending = true;
      try {
        await this.persist();
        if (
          !this.disposed &&
          this.records.get(chainId) === record &&
          record.token === token
        ) {
          record.consentPending = undefined;
          this.publish(record, {
            publicFallback: true,
            nextDueAt: 0,
            status:
              record.snapshot.status === "checking"
                ? "unknown"
                : record.snapshot.status,
          });
        }
      } catch (error) {
        if (this.records.get(chainId) === record && record.token === token) {
          record.consentPending = undefined;
          // A later queued write might have captured the pending intent.
          // Serialize its rollback too; a failed opt-in never opens probes.
          await this.persist().catch(() => undefined);
        }
        throw error;
      }
    }
    return this.getSnapshot(chainId);
  }

  async check(
    chainId: string,
    reason: EndpointCheckReason
  ): Promise<EndpointHealthSnapshot | undefined> {
    if (this.disposed) return this.getSnapshot(chainId);
    await this.init();
    if (this.disposed) return this.getSnapshot(chainId);
    const record = this.reconcile(chainId);
    if (!record) return undefined;
    if (record.consentPending !== undefined) return record.snapshot;
    const old = this.flights.get(chainId);
    if (old?.token === record.token) {
      if (reason !== "automatic") {
        if (old.phase === "probing") old.immediateRecovery = true;
        else if (
          record.connectRecoveryAvailable &&
          record.snapshot.publicFallback
        ) {
          // Selection is already complete, but its write can still be pending.
          // Coalesce one follow-up rather than losing this recovery request.
          old.followup ??= old.promise.then(() =>
            !this.disposed &&
            this.records.get(chainId) === record &&
            record.token === old.token
              ? this.check(chainId, reason)
              : this.getSnapshot(chainId)
          );
          return old.followup;
        }
      }
      return old.promise;
    }
    const escalation =
      reason !== "automatic" &&
      record.snapshot.publicFallback &&
      record.connectRecoveryAvailable;
    if (
      reason !== "manual" &&
      record.snapshot.nextDueAt > this.now() &&
      !escalation
    )
      return record.snapshot;
    const flight: Flight = {
      token: record.token,
      controller: new AbortController(),
      immediateRecovery: reason !== "automatic",
      consumeConnectRecovery: escalation,
      phase: "probing",
      promise: Promise.resolve(undefined),
    };
    this.flights.set(chainId, flight);
    flight.promise = Promise.resolve()
      .then(() => this.runCheck(record, flight))
      .finally(() => {
        if (this.flights.get(chainId) === flight) this.flights.delete(chainId);
      });
    return flight.promise;
  }

  async checkDue(): Promise<void> {
    if (this.disposed) return;
    await this.init();
    if (this.disposed) return;
    await Promise.all(
      ENDPOINT_INVENTORY.map(async ({ chainId }) => {
        const record = this.reconcile(chainId);
        if (record && record.snapshot.nextDueAt <= this.now())
          await this.check(chainId, "automatic");
      })
    );
  }

  private current(record: HealthRecord, flight: Flight): boolean {
    return (
      !this.disposed &&
      !flight.controller.signal.aborted &&
      this.records.get(record.snapshot.chainId) === record &&
      record.token === flight.token
    );
  }

  private async runCheck(
    record: HealthRecord,
    flight: Flight
  ): Promise<EndpointHealthSnapshot | undefined> {
    if (!this.current(record, flight))
      return this.getSnapshot(record.snapshot.chainId);
    if (flight.consumeConnectRecovery) {
      // Consume and persist the one-time escalation before any network work.
      // A worker restart must not restore an already-used opportunity.
      record.connectRecoveryAvailable = false;
      const previousStatus = record.snapshot.status;
      this.publish(record, {
        status: "checking",
        nextDueAt: this.now() + NORMAL_INTERVAL,
      });
      try {
        await this.persist();
      } catch (error) {
        if (this.current(record, flight))
          this.publish(record, { status: previousStatus });
        throw error;
      }
      if (!this.current(record, flight))
        return this.getSnapshot(record.snapshot.chainId);
    }
    const chainId = record.snapshot.chainId;
    const inventory = getEndpointInventory(chainId)!;
    const preferred = record.snapshot.preferred;
    const original = record.snapshot.effective;
    const capabilities = CAPS.filter((capability) => !!preferred[capability]);
    const receipts = new Map<string, EndpointCapabilityHealth>();
    const key = (capability: EndpointCapability, url: string) =>
      `${capability}:${url}`;
    const healthy = (receipt: EndpointCapabilityHealth | undefined) =>
      receipt?.status === "healthy" &&
      receipt.checkedAt !== undefined &&
      receipt.checkedAt <= this.now() &&
      this.now() - receipt.checkedAt <= ENDPOINT_RECEIPT_TTL;
    const get = (capability: EndpointCapability, url: string) =>
      receipts.get(key(capability, url)) ?? unknown(url);
    const probeTuple = async (
      tuple: EndpointTuple,
      wanted: readonly EndpointCapability[]
    ) => {
      const pending = wanted.filter(
        (capability) =>
          tuple[capability] &&
          !receipts.has(key(capability, tuple[capability]!))
      );
      let next = 0;
      await Promise.all(
        [0, 1].map(async () => {
          for (;;) {
            const capability = pending[next++];
            if (!capability || !this.current(record, flight)) return;
            const endpoint = tuple[capability]!;
            const receipt = await probeEndpoint({
              chainId,
              evmChainId: inventory.evmChainId,
              capability,
              endpoint,
              fetch: this.fetch,
              now: this.now,
              signal: flight.controller.signal,
            });
            receipts.set(key(capability, endpoint), receipt);
          }
        })
      );
      const rpc = receipts.get(key("rpc", tuple.rpc));
      const rest = receipts.get(key("rest", tuple.rest));
      if (rpc && rest) {
        const pair = checkCosmosProfileLag(rpc, rest);
        receipts.set(key("rpc", tuple.rpc), pair[0]);
        receipts.set(key("rest", tuple.rest), pair[1]);
      }
    };
    this.publish(record, { status: "checking" });
    await probeTuple(preferred, capabilities);
    if (!this.current(record, flight)) return this.getSnapshot(chainId);
    if (!sameTuple(preferred, original))
      await probeTuple(original, capabilities);
    if (!this.current(record, flight)) return this.getSnapshot(chainId);
    for (const capability of capabilities) {
      if (healthy(get(capability, preferred[capability]!))) {
        record.failures[capability] = 0;
        record.successes[capability] = Math.min(
          3,
          record.successes[capability] + 1
        );
      } else {
        record.failures[capability] = Math.min(
          10,
          record.failures[capability] + 1
        );
        record.successes[capability] = 0;
      }
    }
    const selected = { ...original };
    for (const capability of capabilities) {
      const preferredURL = preferred[capability]!;
      if (
        selected[capability] !== preferredURL &&
        healthy(get(capability, preferredURL)) &&
        (!healthy(get(capability, selected[capability]!)) ||
          (record.successes[capability] >= 3 &&
            this.now() - (record.snapshot.lastSwitchAt ?? this.now()) >=
              RESTORE_RESIDENCE))
      ) {
        selected[capability] = preferredURL;
      }
    }
    const needsRecovery = (capability: EndpointCapability) =>
      !healthy(get(capability, selected[capability]!)) &&
      (flight.immediateRecovery ||
        record.failures[capability] >= 2 ||
        get(capability, preferred[capability]!).status === "wrong-chain" ||
        selected[capability] !== preferred[capability]);
    let attemptedRecovery = false;
    if (record.snapshot.publicFallback) {
      for (const profile of inventory.profiles) {
        const needed = capabilities.filter(needsRecovery);
        if (!needed.length || !this.current(record, flight)) break;
        attemptedRecovery = true;
        const wanted: EndpointCapability[] =
          needed.includes("rpc") || needed.includes("rest")
            ? ["rpc", "rest"]
            : [];
        if (needed.includes("evmRpc")) wanted.push("evmRpc");
        await probeTuple(profile.endpoints, wanted);
        if (!this.current(record, flight)) return this.getSnapshot(chainId);
        for (const capability of needed) {
          const url = profile.endpoints[capability];
          if (url && healthy(get(capability, url))) selected[capability] = url;
        }
      }
    }
    if (!this.current(record, flight)) return this.getSnapshot(chainId);
    // Also reject a clearly lagging member of a mixed-provider Cosmos pair.
    const pair = checkCosmosProfileLag(
      get("rpc", selected.rpc),
      get("rest", selected.rest)
    );
    const ageReceipt = (
      receipt: EndpointCapabilityHealth
    ): EndpointCapabilityHealth =>
      receipt.status === "healthy" && !healthy(receipt)
        ? Object.freeze({
            ...receipt,
            status: "stale",
            detail: "Health receipt expired during this check",
          })
        : receipt;
    const health: EndpointHealthSnapshot["capabilities"] = Object.freeze({
      rpc: ageReceipt(pair[0]),
      rest: ageReceipt(pair[1]),
      ...(selected.evmRpc
        ? { evmRpc: ageReceipt(get("evmRpc", selected.evmRpc)) }
        : {}),
    });
    const healthyCount = capabilities.filter((capability) =>
      healthy(health[capability])
    ).length;
    const status: EndpointHealthSnapshot["status"] =
      healthyCount === capabilities.length
        ? sameTuple(selected, preferred)
          ? "healthy"
          : "backup"
        : healthyCount > 0
        ? "degraded"
        : "unavailable";
    flight.phase = "persisting";
    record.connectRecoveryAvailable =
      !flight.immediateRecovery &&
      !attemptedRecovery &&
      record.snapshot.publicFallback &&
      healthyCount < capabilities.length;
    record.failedPasses =
      status === "unavailable" ? Math.min(4, record.failedPasses + 1) : 0;
    this.publish(record, {
      effective: Object.freeze(selected),
      capabilities: health,
      status,
      checkedAt: this.now(),
      nextDueAt:
        this.now() +
        Math.min(
          MAX_BACKOFF,
          NORMAL_INTERVAL * Math.pow(2, Math.max(0, record.failedPasses - 1))
        ),
    });
    await this.persist();
    return this.getSnapshot(chainId);
  }

  private publish(
    record: HealthRecord,
    change: Partial<EndpointHealthSnapshot>
  ): void {
    if (this.disposed) return;
    const old = record.snapshot;
    const switched =
      change.effective !== undefined &&
      !sameTuple(old.effective, change.effective);
    record.snapshot = Object.freeze({
      ...old,
      ...change,
      generation: old.generation + Number(switched),
      revision: ++this.revision,
      lastSwitchAt: switched ? this.now() : old.lastSwitchAt,
    });
    this.generations.set(record.snapshot.chainId, record.snapshot.generation);
    this.notify(record.snapshot);
  }

  private notify(snapshot: EndpointHealthSnapshot): void {
    try {
      this.options.onChange(snapshot);
    } catch {
      // Notification is an invalidation hint, not part of probe/selection state.
    }
  }

  private persist(): Promise<void> {
    const data = {
      version: 1,
      records: Array.from(
        this.records.values(),
        ({
          snapshot,
          fingerprint,
          consentPending,
          connectRecoveryAvailable,
        }): StoredRecord => ({
          chainId: snapshot.chainId,
          fingerprint,
          publicFallback: consentPending ?? snapshot.publicFallback,
          effective: snapshot.effective,
          updatedAt: this.now(),
          nextDueAt: snapshot.nextDueAt,
          lastSwitchAt: snapshot.lastSwitchAt,
          connectRecoveryAvailable,
        })
      ),
    };
    const write = this.persistence
      .catch(() => undefined)
      .then(() => this.options.kvStore.set("v1", data));
    this.persistence = write;
    return write;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const flight of this.flights.values()) flight.controller.abort();
    this.flights.clear();
  }
}
