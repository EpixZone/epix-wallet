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
  if (!browser?.webRequest?.onBeforeRequest) {
    return;
  }

  // Prime the allow-list from the native host.
  refreshAllowed();

  // 1. Clearnet block: a request whose origin is a `.epix` page may only reach
  // another `.epix` site or loopback (the node), unless the user allowed that
  // origin. Ported verbatim from the old browser-ext background.
  browser.webRequest.onBeforeRequest.addListener(
    (details: any) => {
      const originHost = hostOf(details.originUrl || details.documentUrl || "");
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

  // 2. UI bridge: the Epix settings page talks to this over runtime messaging.
  browser.runtime.onMessage.addListener(
    (msg: any, _sender: any, sendResponse: (r: any) => void) => {
      if (
        !msg ||
        typeof msg.type !== "string" ||
        !msg.type.startsWith("epix-")
      ) {
        return false;
      }
      (async () => {
        switch (msg.type) {
          case "epix-status": {
            try {
              const status: EpixStatus = await nativeSend({ cmd: "status" });
              sendResponse({ ok: true, status });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case "epix-set-tor-clearnet": {
            try {
              const on = !!msg.on;
              await nativeSend({ cmd: "setTorClearnet", on });
              sendResponse({ ok: true, on });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case "epix-list-clearnet-allow": {
            await refreshAllowed();
            sendResponse({ ok: true, sites: Array.from(allowed) });
            break;
          }
          case "epix-set-clearnet-allow": {
            try {
              const site: string = msg.site;
              const allow = !!msg.allow;
              await nativeSend({ cmd: "setClearnetAllow", site, allow });
              if (allow) allowed.add(site);
              else allowed.delete(site);
              sendResponse({ ok: true, site, allow });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          default:
            sendResponse({ ok: false, error: "unknown epix message" });
        }
      })();
      return true; // async sendResponse
    }
  );
}
