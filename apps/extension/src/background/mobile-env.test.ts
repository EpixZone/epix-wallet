const mockSend = jest.fn();
const mockBase = { isInternalMsg: false, sender: { url: "https://xid.epix/" } };
jest.mock("@keplr-wallet/router", () => ({ APP_PORT: "app" }));
jest.mock("@keplr-wallet/router-extension", () => ({
  ExtensionEnv: { produceEnv: () => mockBase },
  InExtensionMessageRequester: class {
    sendMessage(...args: unknown[]) {
      return mockSend(...args);
    }
  },
  InteractionAddon: {
    ReplacePageMsg: class {
      routerMeta = {};
      constructor(public url: string) {}
    },
  },
}));
jest.mock("@keplr-wallet/router-extension/build/utils", () => ({
  getKeplrExtensionRouterId: () => "wallet-router",
}));
import { mobileEnv } from "./mobile-env";

const handlers = new Map<string, () => void>();
const mockShow = jest.fn();
beforeEach(() => {
  mockSend.mockReset();
  mockShow.mockReset();
  handlers.clear();
  mockBase.isInternalMsg = false;
  (globalThis as any).window = {
    webkit: { messageHandlers: { epixDappUI: { postMessage: mockShow } } },
    addEventListener: (name: string, handler: () => void) =>
      handlers.set(name, handler),
    removeEventListener: (name: string) => handlers.delete(name),
  };
  (globalThis as any).browser = {
    runtime: { getURL: (path: string) => "http://127.0.0.1/EpixWallet" + path },
  };
});
afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).browser;
});

test("internal requests and ordinary extensions keep their existing transport", () => {
  mockBase.isInternalMsg = true;
  expect(mobileEnv({} as any, {})).toBe(mockBase);
  mockBase.isInternalMsg = false;
  delete (globalThis as any).window.webkit;
  expect(mobileEnv({} as any, {})).toBe(mockBase);
});

test("external approval retains the origin and waits for the protected result", async () => {
  mockSend
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce("approved-result");
  const env = mobileEnv({} as any, {});
  expect(env.isInternalMsg).toBe(false);
  expect(env.sender.url).toBe("https://xid.epix/");
  const message = { routerMeta: {} };
  const result = await env.requestInteraction("approve", message as any);
  expect(result).toBe("approved-result");
  expect(mockShow).toHaveBeenCalledTimes(1);
  expect(mockSend.mock.calls[0][1].url).toContain("interactionInternal=false");
  expect(mockSend.mock.calls[1][1]).toBe(message);
  expect(message.routerMeta).toEqual({ receiverRouterId: "wallet-router" });
  expect(handlers.size).toBe(0);
});

test("closing during UI navigation cancels before forwarding the protected message", async () => {
  let finishNavigation!: () => void;
  mockSend.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishNavigation = resolve;
      })
  );
  const onClose = jest.fn();
  const env = mobileEnv({} as any, {});
  const result = env.requestInteraction("approve", { routerMeta: {} } as any, {
    unstableOnClose: onClose,
  });
  const rejected = expect(result).rejects.toThrow("wallet closed");
  handlers.get("epix-wallet-closed")!();
  finishNavigation();
  await rejected;
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(handlers.size).toBe(0);
});
