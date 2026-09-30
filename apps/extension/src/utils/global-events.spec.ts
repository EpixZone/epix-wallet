import { webcrypto } from "crypto";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalBrowser = Object.getOwnPropertyDescriptor(globalThis, "browser");
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
let receive: (event: Partial<MessageEvent>) => void;
const sender = {} as Window;

beforeEach(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
  (globalThis as any).window = {
    location: { origin: "chrome-extension://wallet" },
    addEventListener: (_type: string, listener: typeof receive) => {
      receive = listener;
    },
    removeEventListener: jest.fn(),
  };
  (globalThis as any).browser = {
    extension: { getViews: () => [window, sender] },
  };
});

afterEach(() => {
  for (const [name, descriptor] of [
    ["window", originalWindow],
    ["browser", originalBrowser],
    ["crypto", originalCrypto],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as any)[name];
  }
});

test("global events only accept messages from wallet views", async () => {
  const { addGlobalEventListener } = await import("./global-events");
  const listener = jest.fn();
  const remove = addGlobalEventListener("refresh", listener);
  const data = {
    type: "__global_event_except_self",
    eventName: "refresh",
    params: "updated",
    viewId: "other-view",
  };
  receive({ data, origin: "https://attacker.example", source: sender });
  receive({ data, origin: window.location.origin, source: {} as Window });
  expect(listener).not.toHaveBeenCalled();
  receive({ data, origin: window.location.origin, source: sender });
  expect(listener).toHaveBeenCalledWith("updated");
  // Browsers can conceal the source of messages from privileged extension code.
  receive({ data, origin: window.location.origin, source: null });
  expect(listener).toHaveBeenCalledTimes(2);
  remove();
  expect(window.removeEventListener).toHaveBeenCalledWith("message", receive);
});
