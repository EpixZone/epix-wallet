import { webcrypto } from "crypto";
import { BitcoinProvider, Keplr } from "./keplr";
import { JSONUint8Array } from "./uint8-array";

class TestKeplr extends Keplr {
  static request() {
    return this.staticRequestMethod("ping", []);
  }
}

class TestBitcoinProvider extends BitcoinProvider {
  static request() {
    return this._requestMethod("getAccounts", []);
  }
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
let receive: (event: Partial<MessageEvent>) => void;
let request: { id: string };

beforeEach(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
  (globalThis as any).window = {
    location: { origin: "https://dapp.example" },
    addEventListener: (_type: string, listener: typeof receive) => {
      receive = listener;
    },
    removeEventListener: jest.fn(),
    postMessage: (message: typeof request) => {
      request = message;
    },
  };
});

afterEach(() => {
  for (const [name, descriptor] of [
    ["window", originalWindow],
    ["crypto", originalCrypto],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as any)[name];
  }
});

describe.each([TestKeplr, TestBitcoinProvider])(
  "provider message origin",
  (Provider) => {
    test("only a response from the same window and origin completes a browser request", async () => {
      const result = Provider.request();
      const data = {
        type: "proxy-request-response",
        id: request.id,
        result: { return: "accepted" },
      };
      receive({ data, origin: "https://attacker.example", source: window });
      receive({ data, origin: window.location.origin, source: {} as Window });
      receive({ data, origin: "", source: null });
      receive({
        data: { ...data, id: "another-request" },
        origin: window.location.origin,
        source: window,
      });
      receive({
        data: { ...data, type: "unrelated-message" },
        origin: window.location.origin,
        source: window,
      });
      expect(window.removeEventListener).not.toHaveBeenCalled();

      receive({ data, origin: window.location.origin, source: window });
      await expect(result).resolves.toBe("accepted");
      expect(window.removeEventListener).toHaveBeenCalledTimes(1);
    });

    test("shared transport unwraps binary results", async () => {
      const result = Provider.request();
      const bytes = new Uint8Array([0, 128, 255]);
      receive({
        origin: window.location.origin,
        source: window,
        data: {
          type: "proxy-request-response",
          id: request.id,
          result: JSONUint8Array.wrap({ return: bytes }),
        },
      });
      await expect(result).resolves.toEqual(bytes);
    });

    test.each([
      [undefined, "Result is null"],
      [{ error: "Permission denied" }, "Permission denied"],
    ])("shared transport rejects error result %j", async (reply, message) => {
      const result = Provider.request();
      receive({
        origin: window.location.origin,
        source: window,
        data: {
          type: "proxy-request-response",
          id: request.id,
          result: reply,
        },
      });
      await expect(result).rejects.toThrow(message as string);
      expect(window.removeEventListener).toHaveBeenCalledTimes(1);
    });

    test("native synthetic responses work without accepting cross-origin window messages", async () => {
      (window as any).ReactNativeWebView = {
        postMessage: (message: string) => {
          request = JSON.parse(message);
        },
      };
      const result = Provider.request();
      const data = JSON.stringify({
        type: "proxy-request-response",
        id: request.id,
        result: { return: "native" },
      });
      receive({ data, origin: "https://attacker.example", source: window });
      receive({ data, origin: "", source: {} as Window });
      expect(window.removeEventListener).not.toHaveBeenCalled();

      receive({ data, origin: "", source: null });
      await expect(result).resolves.toBe("native");
      expect(window.removeEventListener).toHaveBeenCalledTimes(1);
    });
  }
);
