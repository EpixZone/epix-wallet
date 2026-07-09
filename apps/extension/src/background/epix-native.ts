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
// The base proxy routing (PAC: `.epix` -> node proxy, clearnet -> DIRECT or
// the node's Tor SOCKS) is written by the launcher's Firefox profile at
// startup. On top of it, a `proxy.onRequest` listener here re-decides the
// clearnet leg per request, so flipping "route clearnet through Tor" applies
// immediately instead of on the next launch. `.epix`, loopback, and
// `*.epix.zone` always return undefined and fall through to the PAC.
//
// Native messaging only exists in the desktop Firefox shell; on GeckoView /
// WKWebView the calls throw and are swallowed, so this is a no-op there.

const NATIVE_HOST = "zone.epix.nmh";

// Sites the user allowed to reach clearnet, mirrored from the native host so the
// synchronous webRequest listener can consult it without a round-trip. (The Tor
// routing state lives on the native host; the UI reads it from `status`.)
let allowed = new Set<string>();

// Tor routing state, mirrored the same way for the synchronous proxy
// listener. null = not learned yet; the listener then defers to the PAC's
// launch-time choice.
let torClearnet: boolean | null = null;
let torEnabled: boolean | null = null;

// The node's Tor SOCKS listener, a fixed contract with the desktop shell
// (SOCKS_ADDR in epix-browser's launcher).
const TOR_SOCKS_HOST = "127.0.0.1";
const TOR_SOCKS_PORT = 43111;

function mirrorRoutingState(status: EpixStatus | undefined): void {
  if (!status) return;
  if (typeof status.tor_clearnet === "boolean") {
    torClearnet = status.tor_clearnet;
  }
  if (typeof status.tor_enabled === "boolean") {
    torEnabled = status.tor_enabled;
  }
}

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

  // 1b. Live clearnet routing (Firefox shells only; Chrome has no
  // proxy.onRequest and never enters here). Only general clearnet is steered:
  // everything the PAC routes specially falls through with undefined. Until
  // the native host has answered a status query, everything falls through,
  // so shells without a native host keep exactly the launcher's routing.
  if (browser.proxy?.onRequest) {
    browser.proxy.onRequest.addListener(
      (details: any) => {
        const host = hostOf(details.url || "");
        if (
          !host ||
          isEpix(host) ||
          isLocal(host) ||
          host === "epix.zone" ||
          host.endsWith(".epix.zone")
        ) {
          return undefined; // the PAC decides (node proxy / DIRECT)
        }
        if (torClearnet == null || torEnabled == null) {
          return undefined; // state unknown: keep the launch-time routing
        }
        if (torClearnet && torEnabled) {
          return [
            {
              type: "socks",
              host: TOR_SOCKS_HOST,
              port: TOR_SOCKS_PORT,
              proxyDNS: true,
            },
          ];
        }
        return { type: "direct" };
      },
      { urls: ["<all_urls>"] }
    );

    // Prime the routing mirror; the panel's status polling keeps it fresh.
    nativeSend({ cmd: "status" }).then(
      (status: EpixStatus) => mirrorRoutingState(status),
      () => {
        // No native host (mobile shells, plain Firefox): mirrors stay null
        // and the listener keeps falling through.
      }
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
          (status: EpixStatus) => {
            mirrorRoutingState(status);
            return { ok: true, status };
          },
          (e) => ({ ok: false, error: String(e) })
        );
      case "epix-set-tor-clearnet":
        return nativeSend({ cmd: "setTorClearnet", on: !!msg.on }).then(
          () => {
            // The routing listener picks the change up immediately.
            torClearnet = !!msg.on;
            return { ok: true, on: !!msg.on };
          },
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
      // Ledger over the native host: the UI transport (TransportNativeBridge)
      // cannot call the host directly (native messaging is background-only),
      // so it relays APDUs through here. The host implements the Ledger HID
      // framing (epix-nmh's ledger module).
      case "epix-ledger-list":
        return nativeSend({ cmd: "ledgerList" }).then(
          (r: any) => ({ ok: !r?.error, ...r }),
          (e) => ({ ok: false, error: String(e) })
        );
      case "epix-ledger-exchange":
        return nativeSend({
          cmd: "ledgerExchange",
          apdu: msg.apdu,
          path: msg.path,
        }).then(
          (r: any) =>
            r?.response
              ? { ok: true, response: r.response }
              : { ok: false, error: r?.error || "no response" },
          (e) => ({ ok: false, error: String(e) })
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
