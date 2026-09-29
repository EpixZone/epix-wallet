import { webcrypto } from "crypto";
import { Keplr } from "./keplr";

const originalGlobals = new Map(
  ["window", "crypto", "CustomEvent"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ])
);
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("failed initial provider discovery is handled and a later request retries", async () => {
  const listeners = new Map<
    string,
    Set<(event: Partial<MessageEvent>) => void>
  >();
  const requests: { id: string; args: { method: string } }[] = [];
  const report = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: class {
      constructor(readonly type: string, readonly options: unknown) {}
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "https://dapp.example" },
      addEventListener: (
        type: string,
        listener: (event: Partial<MessageEvent>) => void
      ) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)?.add(listener);
      },
      removeEventListener: (
        type: string,
        listener: (event: Partial<MessageEvent>) => void
      ) => listeners.get(type)?.delete(listener),
      postMessage: (request: (typeof requests)[number]) =>
        requests.push(request),
      dispatchEvent: jest.fn(),
    },
  });
  const reply = (index: number, result: unknown) => {
    for (const listener of listeners.get("message") ?? []) {
      listener({
        origin: window.location.origin,
        source: window,
        data: {
          type: "proxy-request-response",
          id: requests[index].id,
          result,
        },
      });
    }
  };

  try {
    const wallet = new Keplr();
    reply(0, { error: "background unavailable" });
    await flush();
    expect(report).toHaveBeenCalledWith(
      "Failed to initialize Ethereum provider state"
    );
    expect(wallet.ethereum.isConnected()).toBe(false);

    const connect = jest.fn();
    const accounts = jest.fn();
    wallet.ethereum.on("connect", connect);
    wallet.ethereum.on("accountsChanged", accounts);
    const result = wallet.ethereum.request({ method: "eth_chainId" });
    expect(requests[1].args.method).toBe("keplr_initProviderState");
    reply(1, {
      return: {
        currentEvmChainId: 1,
        currentChainId: "eip155:1",
        selectedAddress: "0x1234",
      },
    });
    await flush();
    expect(wallet.ethereum.isConnected()).toBe(true);
    expect(wallet.ethereum.chainId).toBe("0x1");
    expect(wallet.ethereum.selectedAddress).toBe("0x1234");
    expect(connect).toHaveBeenCalledWith({ chainId: "0x1" });
    expect(accounts).toHaveBeenCalledWith(["0x1234"]);
    reply(2, { return: "0x1" });
    await expect(result).resolves.toBe("0x1");
  } finally {
    report.mockRestore();
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as any)[name];
    }
  }
});
