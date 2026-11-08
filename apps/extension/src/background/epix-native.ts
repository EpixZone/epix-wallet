// Epix desktop integration for the managed-Firefox shell.
//
// This absorbs the whole of the old standalone `browser-ext`, so the shell
// ships a single extension (this wallet) with no gaps:
//   1. A bridge to the node's native-messaging host (`zone.epix.nmh`) so the
//      wallet UI can read Tor + I2P status and our onion / i2p addresses, and
//      flip the "route clearnet through Tor" setting.
//   2. Live proxy routing so the clearnet toggle applies without a restart.
//
// `.epix` pages may use ordinary HTTPS APIs. The routing preference decides
// whether those requests travel directly or over Tor; the wallet must not
// cancel them before Firefox reaches the proxy decision.
//
// The base proxy routing (PAC: `.epix` -> node proxy, clearnet -> DIRECT or
// the node's Tor SOCKS) is written by the launcher's Firefox profile at
// startup. On top of it, a `proxy.onRequest` listener uses the node's current
// SOCKS endpoint for onions and Tor-routed clearnet. Flipping "route clearnet
// through Tor" applies immediately. Xite, I2P, loopback, and EPIX
// infrastructure destinations retain the launcher's dedicated routes.
//
// Native messaging only exists in the desktop Firefox shell; on GeckoView /
// WKWebView the calls throw and are swallowed, so this is a no-op there.

const NATIVE_HOST = "zone.epix.nmh";

// Tor routing state, mirrored the same way for the synchronous proxy
// listener. null = not learned yet; the listener then defers to the PAC's
// launch-time choice.
let torClearnet: boolean | null = null;
let torEnabled: boolean | null = null;
let torStatus: string | null = null;
let torSocksPort: number | null = null;
let routingRevision = 0;
let statusRevision = 0;
let pendingStatus: Promise<EpixStatus> | null = null;

// Only the native node selects a port. Never accept a caller-selected host or
// fall back to a fixed port, which may belong to another local application.
const TOR_SOCKS_HOST = "127.0.0.1";
const UNAVAILABLE_TOR = Symbol("unavailable Tor endpoint");

function validSocksPort(port: unknown): port is number {
  return (
    typeof port === "number" &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
  );
}

function torProxy(socksPort: unknown): any {
  if (!validSocksPort(socksPort)) return UNAVAILABLE_TOR;
  return [
    { type: "socks", host: TOR_SOCKS_HOST, port: socksPort, proxyDNS: true },
    // Terminate Firefox's proxy chain instead of appending a possibly DIRECT
    // launch-time PAC route after a live switch to Tor.
    null,
  ];
}

function mirrorRoutingState(status: EpixStatus | undefined): void {
  if (!status) {
    torSocksPort = null;
    return;
  }
  if (typeof status.tor_clearnet === "boolean") {
    torClearnet = status.tor_clearnet;
  }
  if (typeof status.tor_enabled === "boolean") torEnabled = status.tor_enabled;
  if (typeof status.tor_status === "string") torStatus = status.tor_status;
  torSocksPort = validSocksPort(status.tor_socks_port)
    ? status.tor_socks_port
    : null;
}

// Startup, the toolbar, and the popup can poll simultaneously. Share the
// native round trip and prevent a status sampled before a successful toggle
// from restoring the previous route when its reply arrives late.
function readStatus(): Promise<EpixStatus> {
  if (pendingStatus) return pendingStatus;
  const revision = routingRevision;
  const requestRevision = ++statusRevision;
  const request = nativeSend({ cmd: "status" })
    .then((status: EpixStatus) => {
      const current =
        revision === routingRevision
          ? status
          : {
              ...status,
              ...(torClearnet != null ? { tor_clearnet: torClearnet } : {}),
            };
      if (requestRevision === statusRevision) mirrorRoutingState(current);
      return current;
    })
    .catch((error) => {
      if (requestRevision === statusRevision) torSocksPort = null;
      throw error;
    })
    .finally(() => {
      if (pendingStatus === request) pendingStatus = null;
    });
  pendingStatus = request;
  return request;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
const isEpix = (h: string) => h.endsWith(".epix");
const isXiteAddress = (h: string) => /^epix1[a-z0-9]{20,80}$/.test(h);
const isI2p = (h: string) => h.endsWith(".i2p");
const isOnion = (h: string) => h.endsWith(".onion");
const isLocal = (h: string) =>
  h === "127.0.0.1" || h === "localhost" || h === "[::1]";
// The EPIX chain's own infrastructure (rpc/api/evmrpc.epix.zone). It is the
// wallet's essential backend and follows the PAC's dedicated DIRECT rule.
const isEpixZone = (h: string) => h.endsWith(".epix.zone");

/**
 * Select the per-request route without disturbing destinations owned by the
 * launcher's PAC. Firefox treats `{ type: "direct" }` as a fallback to the
 * configured browser proxy; `null` is the actual no-proxy result.
 */
export function routeEpixRequest(
  url: string,
  clearnetOverTor: boolean | null,
  torIsEnabled: boolean | null,
  currentTorStatus: string | null,
  socksPort?: unknown
): any {
  const host = hostOf(url);
  if (!host) {
    return undefined;
  }
  if (isLocal(host)) {
    return null;
  }
  if (isEpix(host) || isXiteAddress(host) || isI2p(host) || isEpixZone(host)) {
    return undefined;
  }
  if (isOnion(host)) {
    // An unmanaged browser without native status keeps its own onion route.
    // Once the node is known, onions always need its owned SOCKS endpoint,
    // independently of the clearnet preference or Tor readiness.
    const nativeKnown =
      clearnetOverTor != null ||
      torIsEnabled != null ||
      currentTorStatus != null;
    return nativeKnown ? torProxy(socksPort) : undefined;
  }
  if (clearnetOverTor === false) {
    return null;
  }
  if (clearnetOverTor == null) {
    return undefined;
  }

  // `tor_enabled` becomes true only after routing is live. Bootstrapping,
  // Recovering, and Failed are still Tor-on states and must never select a
  // direct route while the user has asked to route clearnet through Tor.
  // Only an explicit Disabled status authorizes direct traffic. An unknown
  // or incomplete status must not undo the user's request to use Tor.
  return currentTorStatus === "Disabled" ? null : torProxy(socksPort);
}

// A typed-ish view of the native host's `status` reply.
export interface EpixStatus {
  serving?: boolean;
  ui_port?: number;
  tor_enabled?: boolean;
  tor_status?: string;
  tor_socks_port?: number;
  onion_address?: string | null;
  i2p_enabled?: boolean;
  i2p_mode?: string;
  i2p_status?: string;
  i2p_address?: string | null;
  tor_clearnet?: boolean;
}

// ---------------------------------------------------------------------------
// Toolbar status icon.
//
// The toolbar button doubles as the network status indicator: the bare Epix
// mark (assets/toolbar-*.png, from the shared assets repo) with a round status
// dot punched into its bottom-right corner, presence-indicator style. The icon
// is redrawn on a canvas and applied with setIcon(); the badge API can't do
// this - it only renders a filled rectangle.
// ---------------------------------------------------------------------------

// Dot geometry in 16-unit space, scaled linearly to each icon size. The punch
// erases a slightly larger circle first so a transparent notch separates the
// dot from the mark on any toolbar color.
const DOT_CX = 12.6;
const DOT_CY = 12.6;
const DOT_R = 3.2;
const DOT_GAP = 1.2;

// 16 fills the 1x slot; 48 serves the 2x slot downscaled (Firefox picks the
// smallest size above 32), exactly like the manifest icons did before the dot.
// Do not add a 32: it would win the 2x pick and get UPscaled into the
// epix-browser shell's 20-css-px button (40 device px), coming out soft - see
// shells/browser-theme/epix-managed.css in EpixNet.
const ICON_SIZES = [16, 48];

type DotState = "off" | "boot" | "ready" | "routed";

// Dot palette, matching the in-wallet status colors
// (components/epix-network/use-epix-status.ts, kept in sync by hand). One
// palette on purpose: the dot is only painted when the native host answers,
// which in practice means the epix-browser shell, and its toolbar is always
// near-black (EpixNet's shells/browser-theme/userChrome.css paints #nav-bar
// #0b0e14 regardless of the OS appearance). Keying colors off
// prefers-color-scheme would follow the OS, not the toolbar, and wash the dot
// out for light-OS users.
const DOT_COLORS: Record<DotState, string> = {
  off: "#64748b",
  boot: "#f5c450",
  ready: "#a78bfa",
  routed: "#4ade80",
};

// The overall privacy posture for a status reply, same decision as the status
// bar's colors: routed when Tor + I2P are up and clearnet goes through Tor,
// boot while anything is still connecting, ready when at least one network is
// up but clearnet is direct, off when nothing is on.
function statusDotState(s: EpixStatus | undefined): DotState {
  if (!s) return "off";
  const torReady = !!s.tor_enabled;
  const i2pReady = !!s.i2p_enabled || (s.i2p_status || "").startsWith("Ready");
  const i2pOn =
    (!!s.i2p_mode && s.i2p_mode !== "disable") ||
    i2pReady ||
    s.i2p_status === "Starting…";
  const connecting =
    (!torReady && s.tor_status === "Bootstrapping") || (i2pOn && !i2pReady);
  const anyOn = torReady || i2pOn || s.tor_status === "Bootstrapping";
  if (torReady && i2pReady && torClearnet !== false) return "routed";
  if (torReady || i2pReady) return "ready";
  if (connecting) return "boot";
  return anyOn ? "boot" : "off";
}

// A 2d canvas that works in both a background page (document) and a service
// worker (OffscreenCanvas). Returns null where neither exists.
function make2dContext(size: number): any {
  const g: any = globalThis as any;
  if (g.OffscreenCanvas !== undefined) {
    return new g.OffscreenCanvas(size, size).getContext("2d");
  }
  if (g.document !== undefined) {
    const canvas = g.document.createElement("canvas");
    canvas.width = canvas.height = size;
    return canvas.getContext("2d");
  }
  return null;
}

// Base mark + punched dot, as ImageData for setIcon. color null = plain mark.
function drawStatusIcon(
  base: ImageBitmap,
  size: number,
  color: string | null
): ImageData | null {
  const ctx = make2dContext(size);
  if (!ctx) return null;
  ctx.drawImage(base, 0, 0, size, size);
  if (color) {
    const s = size / 16;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(DOT_CX * s, DOT_CY * s, (DOT_R + DOT_GAP) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(DOT_CX * s, DOT_CY * s, DOT_R * s, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, size, size);
}

async function loadToolbarBases(
  browser: any
): Promise<Map<number, ImageBitmap>> {
  const bases = new Map<number, ImageBitmap>();
  await Promise.all(
    ICON_SIZES.map(async (size) => {
      const url = browser.runtime.getURL(`assets/toolbar-${size}.png`);
      const blob = await (await fetch(url)).blob();
      bases.set(size, await createImageBitmap(blob));
    })
  );
  return bases;
}

// Mirror the Tor/I2P posture onto the toolbar button, so it is visible without
// opening the wallet - the desktop equivalent of the mobile shells' status
// dot. Desktop Firefox only in practice (mobile shells expose no
// browserAction); without a reachable native host the plain mark is shown.
function initStatusIcon(browser: any): void {
  const action = browser.browserAction || browser.action;
  if (!action?.setIcon) {
    return;
  }
  // Pre-dot builds used the badge API; clear any leftover badge.
  action.setBadgeText?.({ text: "" });

  let bases: Map<number, ImageBitmap> | null = null;
  let painted = "";

  const paint = async (state: DotState | null) => {
    const key = state ?? "none";
    if (key === painted) {
      return;
    }
    try {
      bases ??= await loadToolbarBases(browser);
      const color = state ? DOT_COLORS[state] : null;
      const imageData: Record<number, ImageData> = {};
      for (const size of ICON_SIZES) {
        const base = bases.get(size);
        const img = base ? drawStatusIcon(base, size, color) : null;
        if (img) {
          imageData[size] = img;
        }
      }
      if (Object.keys(imageData).length !== ICON_SIZES.length) {
        return;
      }
      await action.setIcon({ imageData });
      painted = key;
    } catch {
      // Canvas/fetch/setIcon unavailable on this shell: keep the manifest's
      // default icon, which is the same mark without a dot.
    }
  };

  const tick = async () => {
    try {
      const status = await readStatus();
      await paint(statusDotState(status));
    } catch {
      // Native host gone (or not up yet): plain mark, no dot.
      await paint(null);
    }
  };
  void tick();
  setInterval(() => void tick(), 5000);
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

/**
 * Install live proxy routing + the native bridge. Called once from the
 * background entry. Safe on non-desktop shells (native calls just fail and
 * are ignored).
 */
export function initEpixNative(): void {
  const browser: any = (globalThis as any).browser;
  // The native bridge is optional on mobile shells, but always register the
  // runtime side when available so the Tor/I2P shield can reach its host.
  if (!browser?.runtime?.onMessage) {
    return;
  }

  // 1. Live Tor routing (Firefox shells only; Chrome has no proxy.onRequest).
  // Dedicated xite/I2P/infrastructure routes stay with the launcher. Until
  // native status is known, the browser keeps its launch-time routing.
  if (browser.proxy?.onRequest) {
    const route = (url: string) =>
      routeEpixRequest(url, torClearnet, torEnabled, torStatus, torSocksPort);

    // Returning undefined or throwing from onRequest permits PAC fallback.
    // Use the blocking webRequest API to deny traffic when Tor is required
    // but its endpoint is unavailable. Check the selected route too, because
    // status or the live toggle may change between these two browser events.
    browser.webRequest.onBeforeRequest.addListener(
      (details: any) => {
        const expected = route(details.url || "");
        if (expected === UNAVAILABLE_TOR) return { cancel: true };
        if (!Array.isArray(expected)) return undefined;
        const actual = details.proxyInfo;
        return {
          cancel:
            actual?.type !== "socks" ||
            actual?.host !== TOR_SOCKS_HOST ||
            actual?.port !== torSocksPort ||
            actual?.proxyDNS !== true,
        };
      },
      { urls: ["<all_urls>"] },
      ["blocking"]
    );
    browser.proxy.onRequest.addListener(
      (details: any) => {
        const selected = route(details.url || "");
        return selected === UNAVAILABLE_TOR ? undefined : selected;
      },
      { urls: ["<all_urls>"] }
    );

    // Prime the routing mirror; the panel's status polling keeps it fresh.
    readStatus().catch(() => {
      // No native host (mobile shells, plain Firefox): mirrors stay null
      // and the listener keeps falling through.
    });
  }

  // 2. Toolbar status icon: reflect the Tor/I2P posture on the button itself.
  initStatusIcon(browser);

  // 3. UI bridge: the Epix settings page talks to this over runtime messaging.
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
        return readStatus().then(
          (status: EpixStatus) => ({ ok: true, status }),
          (e) => ({ ok: false, error: String(e) })
        );
      case "epix-set-tor-clearnet":
        return nativeSend({ cmd: "setTorClearnet", on: !!msg.on }).then(
          (result: any) => {
            if (result?.ok !== true) {
              return {
                ok: false,
                error: result?.error || "native host rejected routing change",
              };
            }
            // The routing listener picks the change up immediately.
            torClearnet = !!msg.on;
            routingRevision++;
            pendingStatus = null;
            return { ok: true, on: !!msg.on };
          },
          (e) => ({ ok: false, error: String(e) })
        );
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
      default:
        return Promise.resolve({ ok: false, error: "unknown epix message" });
    }
  });
}
