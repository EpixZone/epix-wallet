/* eslint-disable @typescript-eslint/no-empty-function */
// WebExtension API shim for the Epix mobile shells (iOS WKWebView).
//
// WKWebView cannot run WebExtensions, so mobile.html loads the background
// services and the popup UI together in ONE document, served from the
// embedded node. This file runs first and provides just enough of the
// `browser.*` surface for both to work:
//
// - runtime messaging becomes an in-page bus (background and UI share the
//   document; Keplr's router already filters messages by port name)
// - storage.local sits on window.localStorage, storage.session in memory
//   (it is ephemeral by design)
// - tabs.create navigates this document (register / sign approvals replace
//   the popup, like the Android sheet)
// - runtime.sendNativeMessage bridges to the host app over
//   webkit.messageHandlers.epixNmh (the Tor/I2P shield), with the same
//   commands as the desktop native host
// - browser.windows stays UNDEFINED on purpose: the shared code paths check
//   for it and fall back to tabs (see packages/popup) or skip window
//   bookkeeping entirely
//
// webextension-polyfill exports globalThis.browser as-is when it is a plain
// object, so defining it here satisfies both the polyfill imports and the
// direct global uses.

type Listener = (...args: any[]) => any;

const stubEvent = () => {
  const listeners: Listener[] = [];
  return {
    addListener: (l: Listener) => listeners.push(l),
    removeListener: (l: Listener) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
    hasListener: (l: Listener) => listeners.includes(l),
    _listeners: listeners,
  };
};

// ---------------------------------------------------------------------------
// runtime messaging: an in-page bus with the real API's dispatch semantics
// (listener returns a Promise for an async reply, undefined to pass).

const onMessage = stubEvent();

function dispatchMessage(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const sender = { id: EXT_ID, url: window.location.href };
      for (const l of [...onMessage._listeners]) {
        try {
          const r = l(message, sender);
          if (r !== undefined && r !== null && typeof r.then === "function") {
            r.then(resolve, reject);
            return;
          }
          if (r !== undefined) {
            resolve(r);
            return;
          }
        } catch (e) {
          reject(e);
          return;
        }
      }
      reject(
        new Error(
          "Could not establish connection. Receiving end does not exist."
        )
      );
    }, 0);
  });
}

// ---------------------------------------------------------------------------
// storage.local on localStorage; storage.session in memory.

const LOCAL_PREFIX = "epix-ext-storage/";

function storageArea(backend: {
  get: (k: string) => string | null;
  set: (k: string, v: string) => void;
  remove: (k: string) => void;
  keys: () => string[];
}) {
  const get = async (keys?: any): Promise<Record<string, any>> => {
    const out: Record<string, any> = {};
    const read = (k: string, fallback?: any) => {
      const raw = backend.get(k);
      if (raw != null) {
        try {
          out[k] = JSON.parse(raw);
          return;
        } catch {
          // fall through
        }
      }
      if (fallback !== undefined) out[k] = fallback;
    };
    if (keys == null) {
      for (const k of backend.keys()) read(k);
    } else if (typeof keys === "string") {
      read(keys);
    } else if (Array.isArray(keys)) {
      keys.forEach((k) => read(k));
    } else {
      Object.keys(keys).forEach((k) => read(k, keys[k]));
    }
    return out;
  };
  return {
    get,
    set: async (items: Record<string, any>) => {
      for (const k of Object.keys(items)) {
        backend.set(k, JSON.stringify(items[k]));
      }
    },
    remove: async (keys: string | string[]) => {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => backend.remove(k));
    },
    onChanged: stubEvent(),
  };
}

const sessionMem = new Map<string, string>();

// ---------------------------------------------------------------------------
// The native bridge (Tor/I2P status, clearnet toggle): request/reply over a
// WKScriptMessageHandler. The host resolves each call by invoking
// window.__epixNmhReply(id, result) / window.__epixNmhFail(id, error).

let nmhSeq = 0;
const nmhPending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();

(window as any).__epixNmhReply = (id: number, result: any) => {
  nmhPending.get(id)?.resolve(result);
  nmhPending.delete(id);
};
(window as any).__epixNmhFail = (id: number, error: string) => {
  nmhPending.get(id)?.reject(new Error(error));
  nmhPending.delete(id);
};

function sendNativeMessage(_app: string, message: any): Promise<any> {
  const handler = (window as any).webkit?.messageHandlers?.epixNmh;
  if (!handler) {
    return Promise.reject(new Error("native messaging unavailable"));
  }
  return new Promise((resolve, reject) => {
    const id = ++nmhSeq;
    nmhPending.set(id, { resolve, reject });
    handler.postMessage(JSON.stringify({ id, message }));
  });
}

// ---------------------------------------------------------------------------

const EXT_ID = "wallet@epix.zone";

// The wallet's root URL: this document's directory.
const BASE_URL = window.location.href.replace(/[^/]*(\?.*)?(#.*)?$/, "");

// Map the extension's page names to their mobile builds: mobile.html and
// mobile-register.html carry the background services and this shim in the
// same document, which plain popup.html / register.html do not.
function toMobileUrl(url: string): string {
  const mapped = url
    .replace(/(^|\/)register\.html/, "$1mobile-register.html")
    .replace(/(^|\/)(popup|sidePanel)\.html/, "$1mobile.html");
  return new URL(mapped.replace(/^\//, ""), BASE_URL).href;
}

const browserShim = {
  runtime: {
    id: EXT_ID,
    getURL: (path: string) => new URL(path.replace(/^\//, ""), BASE_URL).href,
    sendMessage: (message: any) => dispatchMessage(message),
    onMessage,
    onMessageExternal: stubEvent(),
    onConnect: stubEvent(),
    onInstalled: stubEvent(),
    onStartup: stubEvent(),
    sendNativeMessage,
    getBrowserInfo: async () => ({
      name: "EpixMobile",
      vendor: "Epix",
      version: "1.0",
      buildID: "",
    }),
    getManifest: () => ({
      manifest_version: 2,
      name: "Epix Wallet",
      version: "0.0.1",
    }),
  },
  storage: {
    local: storageArea({
      get: (k) => window.localStorage.getItem(LOCAL_PREFIX + k),
      set: (k, v) => window.localStorage.setItem(LOCAL_PREFIX + k, v),
      remove: (k) => window.localStorage.removeItem(LOCAL_PREFIX + k),
      keys: () => {
        const out: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(LOCAL_PREFIX)) {
            out.push(k.slice(LOCAL_PREFIX.length));
          }
        }
        return out;
      },
    }),
    session: storageArea({
      get: (k) => sessionMem.get(k) ?? null,
      set: (k, v) => void sessionMem.set(k, v),
      remove: (k) => void sessionMem.delete(k),
      keys: () => [...sessionMem.keys()],
    }),
    onChanged: stubEvent(),
  },
  tabs: {
    // Full pages (register, sign approvals) replace this document, exactly
    // like the Android sheet behaves. The extension's page names map to
    // their mobile builds (same app + the in-page background + this shim).
    create: async (options: { url?: string }) => {
      if (options?.url) {
        window.location.href = toMobileUrl(options.url);
      }
      return { id: 1 };
    },
    update: async (_id: number, options: { url?: string }) => {
      if (options?.url) {
        window.location.href = toMobileUrl(options.url);
      }
      return { id: 1 };
    },
    remove: async () => {
      // The host app owns the sheet; ask it to close.
      (window as any).webkit?.messageHandlers?.epixClose?.postMessage("");
    },
    query: async () => [],
    get: async () => {
      throw new Error("tabs.get is not supported");
    },
    sendMessage: async () => undefined,
    onUpdated: stubEvent(),
    onRemoved: stubEvent(),
  },
  // NOTE: no `windows` on purpose - its absence routes the shared code onto
  // the tabs fallbacks (packages/popup) and skips window-id bookkeeping.
  extension: {
    getViews: () => [window],
    inIncognitoContext: false,
  },
  idle: {
    queryState: async () => "active",
    onStateChanged: stubEvent(),
  },
  alarms: {
    create: () => {},
    clear: async () => true,
    onAlarm: stubEvent(),
  },
  notifications: {
    create: async () => "",
  },
  webNavigation: {
    onBeforeNavigate: stubEvent(),
    onCommitted: stubEvent(),
    onCompleted: stubEvent(),
    onErrorOccurred: stubEvent(),
  },
};

if (!(globalThis as any).browser?.runtime?.id) {
  (globalThis as any).browser = browserShim;
  (globalThis as any).chrome = browserShim;
}

export {};
