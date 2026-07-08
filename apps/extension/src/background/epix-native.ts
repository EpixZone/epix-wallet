// Epix desktop integration for the managed-Firefox shell.
//
// This absorbs the whole of the old standalone `browser-ext`, so the shell
// ships a single extension (this wallet) with no gaps:
//   1. Clearnet block (EpixNet #15): a `.epix` page may not reach the open
//      internet unless the user allowed that site. Enforced with a blocking
//      webRequest listener.
//   2. A bridge to the node's native-messaging host (`zone.epix.nmh`) so the
//      wallet UI can read Tor + I2P status and our onion / i2p addresses, and
//      flip the "route clearnet through Tor" setting + per-site clearnet
//      allowances.
//
// The proxy routing itself (PAC: `.epix` -> node proxy, clearnet -> DIRECT or
// the node's Tor SOCKS) is written by the launcher's Firefox profile, exactly
// as before. This module only enforces the block and surfaces state.
//
// Native messaging only exists in the desktop Firefox shell; on GeckoView /
// WKWebView the calls throw and are swallowed, so this is a no-op there.

const NATIVE_HOST = "zone.epix.nmh";

// Sites the user allowed to reach clearnet, mirrored from the native host so the
// synchronous webRequest listener can consult it without a round-trip. (The Tor
// routing state lives on the native host; the UI reads it from `status`.)
let allowed = new Set<string>();

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
const isEpix = (h: string) => h.endsWith(".epix");
const isLocal = (h: string) =>
  h === "127.0.0.1" || h === "localhost" || h === "[::1]";

// A typed-ish view of the native host's `status` reply.
export interface EpixStatus {
  serving?: boolean;
  ui_port?: number;
  tor_enabled?: boolean;
  tor_status?: string;
  onion_address?: string | null;
  i2p_enabled?: boolean;
  i2p_status?: string;
  i2p_address?: string | null;
  tor_clearnet?: boolean;
}

async function nativeSend(msg: object): Promise<any> {
  // browser.runtime.sendNativeMessage is only present in the desktop shell.
  const runtime: any = (globalThis as any).browser?.runtime;
  if (!runtime?.sendNativeMessage) {
    throw new Error("native messaging unavailable");
  }
  return runtime.sendNativeMessage(NATIVE_HOST, msg);
}

/** Whether the desktop native host is reachable (i.e. this is the FF shell). */
export function epixNativeAvailable(): boolean {
  return !!(globalThis as any).browser?.runtime?.sendNativeMessage;
}

async function refreshAllowed(): Promise<void> {
  try {
    const res = await nativeSend({ cmd: "listClearnetAllow" });
    allowed = new Set<string>(res?.sites || []);
  } catch {
    // Native host not up yet; keep the last known set.
  }
}

/**
 * Install the clearnet block + native bridge. Called once from the background
 * entry. Safe on non-desktop shells (native calls just fail and are ignored).
 */
export function initEpixNative(): void {
  const browser: any = (globalThis as any).browser;
  // The UI bridge (part 2) only needs runtime messaging; the clearnet block
  // (part 1) needs webRequest. The mobile shells have no webRequest, so gate
  // the block on it but always register the bridge - otherwise the Tor/I2P
  // shield can't reach the native host and stays hidden there.
  if (!browser?.runtime?.onMessage) {
    return;
  }

  // 1. Clearnet block: a request whose origin is a `.epix` page may only reach
  // another `.epix` site or loopback (the node), unless the user allowed that
  // origin. Ported verbatim from the old browser-ext background. Desktop only
  // (webRequest); on mobile the node/engine enforces the policy instead.
  if (browser.webRequest?.onBeforeRequest) {
    // Prime the allow-list from the native host.
    refreshAllowed();

    browser.webRequest.onBeforeRequest.addListener(
      (details: any) => {
        const originHost = hostOf(
          details.originUrl || details.documentUrl || ""
        );
        if (!isEpix(originHost)) return {};
        const url: string = details.url || "";
        if (
          url.startsWith("data:") ||
          url.startsWith("blob:") ||
          url.startsWith("about:") ||
          url.startsWith("moz-extension:")
        ) {
          return {};
        }
        const targetHost = hostOf(url);
        if (isEpix(targetHost) || isLocal(targetHost)) return {};
        if (allowed.has(originHost)) return {};
        return { cancel: true };
      },
      { urls: ["<all_urls>"] },
      ["blocking"]
    );
  }

  // 2. UI bridge: the Epix settings page talks to this over runtime messaging.
  //
  // Keplr's own router listens on this same `runtime.onMessage`, and `browser`
  // here is the webextension-polyfill, which does NOT support the Chrome-style
  // `sendResponse` + `return true` async pattern - it expects the listener to
  // return a Promise for an async reply, or undefined to not handle the
  // message. Returning `true`/`false` would wedge the shared channel and hang
  // Keplr's popup. So: return undefined for anything that isn't ours (Keplr's
  // router handles it), and a Promise for our own messages.
  browser.runtime.onMessage.addListener((msg: any) => {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("epix-")) {
      return undefined; // not ours - let Keplr's router handle it
    }
    switch (msg.type) {
      case "epix-status":
        return nativeSend({ cmd: "status" }).then(
          (status: EpixStatus) => ({ ok: true, status }),
          (e) => ({ ok: false, error: String(e) })
        );
      case "epix-set-tor-clearnet":
        return nativeSend({ cmd: "setTorClearnet", on: !!msg.on }).then(
          () => ({ ok: true, on: !!msg.on }),
          (e) => ({ ok: false, error: String(e) })
        );
      case "epix-list-clearnet-allow":
        return refreshAllowed().then(() => ({
          ok: true,
          sites: Array.from(allowed),
        }));
      case "epix-open-config":
        // Ask the host to open the node's config page in the browser. Only
        // the mobile hosts implement this (the desktop epix-nmh answers with
        // an error); the panel falls back to a browser tab when not ok.
        return nativeSend({ cmd: "openConfig" }).then(
          (r: any) => (r && r.ok ? { ok: true } : { ok: false }),
          () => ({ ok: false })
        );
      case "epix-set-clearnet-allow": {
        const site: string = msg.site;
        const allow = !!msg.allow;
        return nativeSend({ cmd: "setClearnetAllow", site, allow }).then(
          () => {
            if (allow) allowed.add(site);
            else allowed.delete(site);
            return { ok: true, site, allow };
          },
          (e) => ({ ok: false, error: String(e) })
        );
      }
      default:
        return Promise.resolve({ ok: false, error: "unknown epix message" });
    }
  });
}
