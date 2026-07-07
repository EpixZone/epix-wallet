import { useEffect, useState, useCallback } from "react";

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
  allowedSites: string[];
  setTorClearnet: (on: boolean) => Promise<void>;
  revokeSite: (site: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Poll the Epix node's Tor/I2P status over the background bridge. Works before
 * the keyring is unlocked (the bridge talks to the native host, not the
 * keyring), so it drives both the pre-login screen and the in-wallet shield.
 */
export function useEpixStatus(pollMs = 5000): UseEpixStatus {
  const [status, setStatus] = useState<EpixStatus | null>(null);
  const [available, setAvailable] = useState(false);
  const [torClearnet, setTorClearnetState] = useState(true);
  const [allowedSites, setAllowedSites] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await sendToBackground({ type: "epix-status" });
      if (res?.ok) {
        setStatus(res.status);
        setTorClearnetState(res.status?.tor_clearnet !== false);
        setAvailable(true);
      } else {
        setAvailable(false);
      }
    } catch {
      setAvailable(false);
    }
    try {
      const list = await sendToBackground({ type: "epix-list-clearnet-allow" });
      if (list?.ok) {
        setAllowedSites(list.sites || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const setTorClearnet = useCallback(async (on: boolean) => {
    setTorClearnetState(on);
    try {
      await sendToBackground({ type: "epix-set-tor-clearnet", on });
    } catch {
      setTorClearnetState(!on); // revert on failure
    }
  }, []);

  const revokeSite = useCallback(async (site: string) => {
    setAllowedSites((s) => s.filter((x) => x !== site));
    try {
      await sendToBackground({
        type: "epix-set-clearnet-allow",
        site,
        allow: false,
      });
    } catch {
      // ignore; next refresh reconciles
    }
  }, []);

  return {
    available,
    status,
    torClearnet,
    allowedSites,
    setTorClearnet,
    revokeSite,
    refresh,
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

/**
 * The single shield's color: the overall privacy posture across both networks.
 * Green when both are up (and clearnet is routed through Tor), amber while
 * anything is still connecting, purple when at least one is ready but clearnet
 * is direct, gray when nothing is on.
 */
export function shieldColor(
  status: EpixStatus | null,
  torClearnet: boolean
): string {
  if (!status) return EPIX_DOT_OFF;
  const torReady = !!status.tor_enabled;
  const i2pReady =
    !!status.i2p_enabled || (status.i2p_status || "").startsWith("Ready");
  const anyOn =
    torReady || i2pOn(status) || status.tor_status === "Bootstrapping";
  const connecting =
    (!torReady && status.tor_status === "Bootstrapping") ||
    (i2pOn(status) && !i2pReady);
  if (torReady && i2pReady && torClearnet) return EPIX_DOT_ROUTED;
  if (torReady || i2pReady) return EPIX_DOT_READY;
  if (connecting) return EPIX_DOT_BOOT;
  return anyOn ? EPIX_DOT_BOOT : EPIX_DOT_OFF;
}
