import { action, makeObservable, observable, computed } from "mobx";
import { ChainStore } from "../chain";
import { KeyRingStore } from "@keplr-wallet/stores-core";

const CLAIM_ALL_COMPLETION_COUNTDOWN_SECONDS = 6;

export class ClaimAllEachState {
  @observable
  isLoading = false;

  @observable
  isSimulating = false;

  @observable
  failedReason: Error | undefined = undefined;

  @observable
  hasStarted = false;

  constructor() {
    makeObservable(this);
  }

  @action
  setIsLoading(value: boolean) {
    if (value) {
      this.hasStarted = true;
    }
    this.isLoading = value;
  }

  @action
  setIsSimulating(value: boolean) {
    this.isSimulating = value;
  }

  @action
  setFailedReason(value: Error | undefined) {
    this.isLoading = false;
    this.failedReason = value;
  }

  @action
  reset() {
    this.isLoading = false;
    this.isSimulating = false;
    this.failedReason = undefined;
    this.hasStarted = false;
  }

  @computed
  get isCompleted() {
    return this.hasStarted && !this.isLoading && !this.isSimulating;
  }

  @computed
  get isSucceeded() {
    return this.isCompleted && !this.failedReason;
  }
}

type ClaimAllSessionPhase = "idle" | "loading" | "completed";

export class ClaimAllSessionState {
  @observable.shallow
  chainIds: string[] = [];

  @observable
  completionCount = 0;

  @observable
  phase: ClaimAllSessionPhase = "idle";

  private intervalId: number | undefined;

  constructor() {
    makeObservable(this);
  }

  @action
  start(chainIds: string[]) {
    this.clearInterval();
    this.chainIds = chainIds;
    this.completionCount = 0;
    this.phase = chainIds.length > 0 ? "loading" : "idle";
  }

  @action
  startCompletionCountdown() {
    if (this.chainIds.length === 0) {
      return;
    }

    this.clearInterval();
    this.phase = "completed";
    this.completionCount = CLAIM_ALL_COMPLETION_COUNTDOWN_SECONDS;

    this.intervalId = window.setInterval(
      action(() => {
        if (this.completionCount <= 1) {
          this.reset();
          return;
        }

        this.completionCount -= 1;
      }),
      1000
    );
  }

  @action
  reset() {
    this.clearInterval();
    this.chainIds = [];
    this.completionCount = 0;
    this.phase = "idle";
  }

  @computed
  get showCompletionUI() {
    return this.phase === "completed";
  }

  private clearInterval() {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}

export class ClaimRewardsStateStore {
  private readonly map = new Map<string, ClaimAllEachState>();
  private readonly sessionMap = new Map<string, ClaimAllSessionState>();

  constructor(
    private readonly chainStore: ChainStore,
    private readonly keyRingStore: KeyRingStore,
    private readonly eventListener: {
      addEventListener: (type: string, fn: () => unknown) => void;
    }
  ) {
    this.eventListener.addEventListener("keplr_keystorechange", () => {
      this.resetAll();
    });
  }

  private key(chainId: string) {
    const chainIdentifier = this.chainStore.hasModularChain(chainId)
      ? this.chainStore.getModularChain(chainId).chainIdentifier
      : chainId;
    const keyId = this.keyRingStore.selectedKeyInfo?.id ?? "unknown";
    return `${keyId}:${chainIdentifier}`;
  }

  get(chainId: string) {
    const mapKey = this.key(chainId);
    let state = this.map.get(mapKey);
    if (!state) {
      state = new ClaimAllEachState();
      this.map.set(mapKey, state);
    }
    return state;
  }

  getSession() {
    const keyId = this.keyRingStore.selectedKeyInfo?.id ?? "unknown";
    let session = this.sessionMap.get(keyId);
    if (!session) {
      session = new ClaimAllSessionState();
      this.sessionMap.set(keyId, session);
    }

    return session;
  }

  values() {
    return this.map.values();
  }

  resetForKey(keyId: string | undefined) {
    if (!keyId) {
      return;
    }
    for (const mapKey of Array.from(this.map.keys())) {
      if (mapKey.startsWith(`${keyId}:`)) {
        const state = this.map.get(mapKey);
        if (state) {
          state.reset();
        }
        this.map.delete(mapKey);
      }
    }

    const session = this.sessionMap.get(keyId);
    if (session) {
      session.reset();
    }
    this.sessionMap.delete(keyId);
  }

  resetAll() {
    for (const state of this.map.values()) {
      state.reset();
    }
    this.map.clear();

    for (const session of this.sessionMap.values()) {
      session.reset();
    }
    this.sessionMap.clear();
  }
}
