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

// A WebExtension storage area over a string-keyed backend. The backend is
// async so it can be the native persistent store: WKWebView's localStorage
// is unreliable (it comes back null in the mobile shell), and the keyring
// vault must survive there, so storage.local is persisted by the host app
// (see the epixStore bridge below). storage.session stays in memory.
function storageArea(backend: {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string) => Promise<void>;
  remove: (k: string) => Promise<void>;
  keys: () => Promise<string[]>;
}) {
  const get = async (keys?: any): Promise<Record<string, any>> => {
    const out: Record<string, any> = {};
    const read = async (k: string, fallback?: any) => {
      const raw = await backend.get(k);
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
      const all = await backend.keys();
      await Promise.all(all.map((k) => read(k)));
    } else if (typeof keys === "string") {
      await read(keys);
    } else if (Array.isArray(keys)) {
      await Promise.all(keys.map((k) => read(k)));
    } else {
      await Promise.all(Object.keys(keys).map((k) => read(k, keys[k])));
    }
    return out;
  };
  return {
    get,
    set: async (items: Record<string, any>) => {
      await Promise.all(
        Object.keys(items).map((k) => backend.set(k, JSON.stringify(items[k])))
      );
    },
    remove: async (keys: string | string[]) => {
      await Promise.all(
        (Array.isArray(keys) ? keys : [keys]).map((k) => backend.remove(k))
      );
    },
    onChanged: stubEvent(),
  };
}

// The persistent store for storage.local: the host app over epixStore, with
// an in-memory + localStorage fallback for a plain browser (the register page
// preview, and any non-mobile use of these pages).
let storeSeq = 0;
const storePending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();

(window as any).__epixStoreReply = (id: number, result: any) => {
  storePending.get(id)?.resolve(result);
  storePending.delete(id);
};

function sendStore(op: object): Promise<any> {
  const handler = (window as any).webkit?.messageHandlers?.epixStore;
  return new Promise((resolve, reject) => {
    const id = ++storeSeq;
    storePending.set(id, { resolve, reject });
    handler.postMessage(JSON.stringify({ id, op }));
  });
}

const memStore = new Map<string, string>();

function localBackend() {
  const nativeOk = !!(window as any).webkit?.messageHandlers?.epixStore;
  const lsOk = (() => {
    try {
      return typeof window.localStorage?.getItem === "function";
    } catch {
      return false;
    }
  })();
  if (nativeOk) {
    return {
      get: (k: string) => sendStore({ cmd: "get", key: k }),
      set: (k: string, v: string) =>
        sendStore({ cmd: "set", key: k, value: v }),
      remove: (k: string) => sendStore({ cmd: "remove", key: k }),
      keys: () => sendStore({ cmd: "keys" }),
    };
  }
  if (lsOk) {
    return {
      get: async (k: string) => window.localStorage.getItem(LOCAL_PREFIX + k),
      set: async (k: string, v: string) =>
        window.localStorage.setItem(LOCAL_PREFIX + k, v),
      remove: async (k: string) =>
        window.localStorage.removeItem(LOCAL_PREFIX + k),
      keys: async () => {
        const out: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(LOCAL_PREFIX)) {
            out.push(k.slice(LOCAL_PREFIX.length));
          }
        }
        return out;
      },
    };
  }
  return {
    get: async (k: string) => memStore.get(k) ?? null,
    set: async (k: string, v: string) => void memStore.set(k, v),
    remove: async (k: string) => void memStore.delete(k),
    keys: async () => [...memStore.keys()],
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
    local: storageArea(localBackend()),
    session: storageArea({
      get: async (k) => sessionMem.get(k) ?? null,
      set: async (k, v) => void sessionMem.set(k, v),
      remove: async (k) => void sessionMem.delete(k),
      keys: async () => [...sessionMem.keys()],
    }),
    onChanged: stubEvent(),
  },
  tabs: {
    // Full pages (register, sign approvals) replace this document, exactly
    // like the Android sheet behaves. The extension's page names map to
    // their mobile builds (same app + the in-page background + this shim).
    // The returned promise intentionally never resolves: callers commonly do
    // `tabs.create(...).then(() => window.close())`, and letting that run
    // would race the navigation we just kicked off. The document is
    // unloading, so nothing downstream needs the result.
    create: (options: { url?: string }) => {
      if (options?.url) {
        window.location.href = toMobileUrl(options.url);
      }
      return new Promise<{ id: number }>(() => {});
    },
    update: (_id: number, options: { url?: string }) => {
      if (options?.url) {
        window.location.href = toMobileUrl(options.url);
      }
      return new Promise<{ id: number }>(() => {});
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

// A synchronous localStorage polyfill for the mobile shell. Some wallet code
// touches window.localStorage directly (an EVM-migration flag, WalletConnect,
// the LocalKVStore), and WKWebView returns null for it here. Back it with an
// in-memory map, persisted through the native store (best-effort) so it
// survives across launches. Installed only when the real one is unusable.
function installLocalStoragePolyfill(): void {
  // On the mobile shell, always override window.localStorage with the
  // native-backed polyfill: WKWebView's own localStorage is unreliable here
  // (it reads as a working object one moment and null the next, crashing any
  // direct localStorage.getItem). Off the shell (no native store, e.g. a
  // plain browser preview) leave the real one in place.
  if (!(window as any).webkit?.messageHandlers?.epixStore) return;

  const LS_PREFIX = "epix-ls/";
  const mem = new Map<string, string>();

  const storage = {
    getItem: (k: string): string | null => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
      sendStore({ cmd: "set", key: LS_PREFIX + k, value: String(v) });
    },
    removeItem: (k: string) => {
      mem.delete(k);
      sendStore({ cmd: "remove", key: LS_PREFIX + k });
    },
    clear: () => {
      for (const k of [...mem.keys()]) {
        sendStore({ cmd: "remove", key: LS_PREFIX + k });
      }
      mem.clear();
    },
    key: (i: number): string | null => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };

  let installed = false;
  try {
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
      writable: false,
    });
    installed = window.localStorage === (storage as any);
  } catch {
    // fall through to direct assignment
  }
  if (!installed) {
    try {
      (window as any).localStorage = storage;
    } catch {
      // give up; the native store still backs browser.storage.local
    }
  }

  // Hydrate from the native store (async, best-effort). The direct consumers
  // are optional features that tolerate a cold miss on the very first launch.
  sendStore({ cmd: "keys" }).then(async (keys: string[]) => {
    await Promise.all(
      (keys || [])
        .filter((k) => k.startsWith(LS_PREFIX))
        .map(async (k) => {
          const v = await sendStore({ cmd: "get", key: k });
          if (typeof v === "string") mem.set(k.slice(LS_PREFIX.length), v);
        })
    );
  });
}

installLocalStoragePolyfill();

export {};
