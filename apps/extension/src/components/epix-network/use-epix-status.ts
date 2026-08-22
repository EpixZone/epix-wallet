import { useCallback, useEffect, useReducer } from "react";

// The native-host status shape (crates/epix-nmh + the node's
// /EpixNet-Internal/Status endpoint), surfaced to the wallet UI over the
// extension's runtime messaging by src/background/epix-native.ts.
export interface EpixStatus {
  serving?: boolean;
  tor_enabled?: boolean;
  tor_status?: string;
  onion_address?: string | null;
  // i2p_enabled: our .b32 address has published (fully ready). i2p_mode:
  // "disable" | "embedded" | "external". i2p_status: the phase label
  // ("Off" | "Starting…" | "Ready" | "Failed: …").
  i2p_enabled?: boolean;
  i2p_mode?: string;
  i2p_status?: string;
  i2p_address?: string | null;
  tor_clearnet?: boolean;
}

function sendToBackground(msg: object): Promise<any> {
  const runtime: any = (globalThis as any).browser?.runtime;
  if (!runtime?.sendMessage) {
    return Promise.reject(new Error("extension messaging unavailable"));
  }
  return runtime.sendMessage(msg);
}

export interface UseEpixStatus {
  /** True when the desktop native host answered (i.e. the Firefox shell). */
  available: boolean;
  status: EpixStatus | null;
  torClearnet: boolean;
  setTorClearnet: (on: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// One shared poller for the whole page. The status bar, the layout that pads
// content for it, and the panel all consume this hook at once; a module-level
// store with a refcounted interval keeps that at one native-host round trip
// per tick and every subscriber agreeing on the same snapshot.

// Last observed host availability, so the strip renders in its final place on
// the very first frame of the next popup open instead of popping in (and
// shifting the page 2rem) after the first round trip.
const AVAILABLE_CACHE_KEY = "epix-network/available";

function readCachedAvailable(): boolean {
  try {
    return localStorage.getItem(AVAILABLE_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

const shared = {
  status: null as EpixStatus | null,
  available: readCachedAvailable(),
  torClearnet: true,
};

const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

function notify(): void {
  listeners.forEach((l) => l());
}

function setAvailable(on: boolean): void {
  shared.available = on;
  try {
    localStorage.setItem(AVAILABLE_CACHE_KEY, on ? "1" : "0");
  } catch {
    // ignore; the cache only smooths first paint
  }
}

async function refreshShared(): Promise<void> {
  try {
    const res = await sendToBackground({ type: "epix-status" });
    if (res?.ok) {
      shared.status = res.status;
      if (typeof res.status?.tor_clearnet === "boolean") {
        shared.torClearnet = res.status.tor_clearnet;
      }
      setAvailable(true);
    } else {
      setAvailable(false);
    }
  } catch {
    setAvailable(false);
  }
  notify();
}

/**
 * Subscribe to the Epix node's Tor/I2P status over the background bridge.
 * Works before the keyring is unlocked (the bridge talks to the native host,
 * not the keyring), so it drives both the pre-login screens and the in-wallet
 * status bar. All instances share one poll interval; the first subscriber's
 * `pollMs` wins.
 */
export function useEpixStatus(pollMs = 5000): UseEpixStatus {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    listeners.add(forceRender);
    subscriberCount++;
    if (subscriberCount === 1) {
      refreshShared();
      pollTimer = setInterval(refreshShared, pollMs);
    } else {
      // A later subscriber may mount between ticks; sync it immediately.
      forceRender();
    }
    return () => {
      listeners.delete(forceRender);
      subscriberCount--;
      if (subscriberCount === 0 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }, [pollMs]);

  const setTorClearnet = useCallback(async (on: boolean) => {
    shared.torClearnet = on;
    notify();
    try {
      const result = await sendToBackground({
        type: "epix-set-tor-clearnet",
        on,
      });
      if (!result?.ok) {
        throw new Error(result?.error || "routing change rejected");
      }
    } catch {
      shared.torClearnet = !on; // revert on failure
      notify();
    }
  }, []);

  return {
    available: shared.available,
    status: shared.status,
    torClearnet: shared.torClearnet,
    setTorClearnet,
    refresh: refreshShared,
  };
}

// The desktop extension / mobile shells' status color language.
export const EPIX_DOT_OFF = "#64748b";
export const EPIX_DOT_BOOT = "#f5c450";
export const EPIX_DOT_READY = "#a78bfa";
export const EPIX_DOT_ROUTED = "#4ade80";

export function torColor(
  status: EpixStatus | null,
  torClearnet: boolean
): string {
  if (!status) return EPIX_DOT_OFF;
  if (status.tor_enabled) return torClearnet ? EPIX_DOT_ROUTED : EPIX_DOT_READY;
  if (status.tor_status === "Bootstrapping") return EPIX_DOT_BOOT;
  return EPIX_DOT_OFF;
}

/** Whether I2P is turned on at all (embedded or external router). */
export function i2pOn(status: EpixStatus | null): boolean {
  if (!status) return false;
  if (status.i2p_mode && status.i2p_mode !== "disable") return true;
  // Fall back to the phase for older nodes without i2p_mode.
  return status.i2p_enabled === true || status.i2p_status === "Starting…";
}

export function i2pColor(status: EpixStatus | null): string {
  if (!status || !i2pOn(status)) return EPIX_DOT_OFF;
  // Ready once our address has published.
  if (status.i2p_enabled || (status.i2p_status || "").startsWith("Ready"))
    return EPIX_DOT_READY;
  // Enabled but still connecting (Starting…) or failed: amber "attention".
  return EPIX_DOT_BOOT;
}
