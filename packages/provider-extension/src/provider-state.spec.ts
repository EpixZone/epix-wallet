import { webcrypto } from "crypto";
import { EIP6963EventNames } from "@keplr-wallet/types";
import { EthereumProviderRpcError, Keplr } from "./keplr";

const originalGlobals = new Map(
  ["window", "crypto", "CustomEvent"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ])
);
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const initialState = {
  currentEvmChainId: 1,
  currentChainId: "eip155:1",
  selectedAddress: "0x1234",
};

type ProviderRequest = {
  id: string;
  method: string;
  ethereumProviderMethod: string;
  args: { method: string; params?: unknown; providerId?: string };
};

function setupWindow() {
  const listeners = new Map<
    string,
    Set<(event: Partial<MessageEvent>) => void>
  >();
  const requests: ProviderRequest[] = [];
  const listenersAtRequest: string[][] = [];
  const postMessage = jest.fn((request: ProviderRequest) => {
    listenersAtRequest.push([...listeners.keys()]);
    requests.push(request);
  });
  const dispatchEvent = jest.fn();
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: class {
      readonly detail: unknown;

      constructor(readonly type: string, options: { detail: unknown }) {
        this.detail = options.detail;
      }
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
      postMessage,
      dispatchEvent,
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
  return {
    listeners,
    requests,
    listenersAtRequest,
    postMessage,
    dispatchEvent,
    reply,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as any)[name];
  }
});

test("automatic discovery starts after event handlers are installed and before announcement", async () => {
  const {
    listeners,
    requests,
    listenersAtRequest,
    postMessage,
    dispatchEvent,
    reply,
  } = setupWindow();
  const wallet = new Keplr();

  expect(requests).toHaveLength(1);
  expect(requests[0].args.method).toBe("keplr_initProviderState");
  expect(listenersAtRequest[0]).toEqual(
    expect.arrayContaining([
      "keplr_keystorechange",
      "keplr_chainChanged",
      "keplr_ethSubscription",
      EIP6963EventNames.Request,
    ])
  );
  expect(postMessage.mock.invocationCallOrder[0]).toBeLessThan(
    dispatchEvent.mock.invocationCallOrder[0]
  );
  expect(dispatchEvent).toHaveBeenCalledTimes(1);
  const announcement = dispatchEvent.mock.calls[0][0];
  expect(announcement.type).toBe(EIP6963EventNames.Announce);
  expect(announcement.detail.provider).toBe(wallet.ethereum);
  expect(Object.isFrozen(announcement.detail)).toBe(true);
  expect(wallet.ethereum.isConnected()).toBe(false);

  for (const listener of listeners.get(EIP6963EventNames.Request) ?? []) {
    listener({});
  }
  expect(dispatchEvent).toHaveBeenLastCalledWith(announcement);
  expect(dispatchEvent).toHaveBeenCalledTimes(2);
  expect(requests).toHaveLength(1);

  reply(0, { return: initialState });
  await flush();
  expect(wallet.ethereum.isConnected()).toBe(true);
  expect(wallet.ethereum.chainId).toBe("0x1");
  expect(wallet.ethereum.selectedAddress).toBe("0x1234");
});

test("failed initial provider discovery is handled and a later request retries", async () => {
  const { requests, reply } = setupWindow();
  const report = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
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
  reply(1, { return: initialState });
  await flush();
  expect(wallet.ethereum.isConnected()).toBe(true);
  expect(wallet.ethereum.chainId).toBe("0x1");
  expect(wallet.ethereum.selectedAddress).toBe("0x1234");
  expect(connect).toHaveBeenCalledWith({ chainId: "0x1" });
  expect(accounts).toHaveBeenCalledWith(["0x1234"]);
  reply(2, { return: "0x1" });
  await expect(result).resolves.toBe("0x1");
});

test("shared proxy transport preserves Ethereum request metadata and RPC errors", async () => {
  const { requests, reply, dispatchEvent } = setupWindow();
  const wallet = new Keplr();
  reply(0, { return: initialState });
  await flush();

  const result = wallet.ethereum.request({
    method: "eth_unknownMethod",
    params: ["0x1234"],
  });
  expect(requests[1]).toMatchObject({
    method: "ethereum",
    ethereumProviderMethod: "request",
    args: {
      method: "eth_unknownMethod",
      params: ["0x1234"],
      providerId: dispatchEvent.mock.calls[0][0].detail.info.uuid,
    },
  });
  reply(1, {
    error: {
      code: -32601,
      message: "Method not found",
      data: { method: "eth_unknownMethod" },
    },
  });
  await expect(result).rejects.toBeInstanceOf(EthereumProviderRpcError);
  await expect(result).rejects.toMatchObject({
    code: -32601,
    message: "Method not found",
    data: { method: "eth_unknownMethod" },
  });
});
