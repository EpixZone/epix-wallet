import { BackgroundTxService } from "./service";
import { BackgroundTxEthereumService } from "../tx-ethereum/service";
import { ChainsService } from "../chains";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { TendermintTxTracer } from "@keplr-wallet/cosmos";

jest.mock("@keplr-wallet/simple-fetch", () => ({ simpleFetch: jest.fn() }));
jest.mock("@keplr-wallet/cosmos", () => ({
  TendermintTxTracer: jest.fn(),
  ChainIdHelper: jest.requireActual("@keplr-wallet/cosmos").ChainIdHelper,
}));

const fetchMock = simpleFetch as jest.Mock;
const tracerMock = TendermintTxTracer as jest.Mock;
const realImmediate =
  jest.requireActual<typeof import("timers")>("timers").setImmediate;
const flush = () => new Promise<void>((resolve) => realImmediate(resolve));
async function advance(ms: number) {
  jest.advanceTimersByTime(ms);
  await flush();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(type: "evm" | "cosmos" | "ethermint") {
  let chain = {
    type,
    chainId: type === "evm" ? "eip155:1916" : "epix_1916-1",
    evm: { rpc: "https://a.test" },
    cosmos: { rpc: "https://a.test", rest: "https://a.test" },
  };
  const chains = {
    getModularChainInfoOrThrow: jest.fn(() => chain),
  } as unknown as ChainsService;
  const notification = { create: jest.fn() };
  return {
    chains,
    notification,
    chainId: chain.chainId,
    move(rpc: string, chainId = chain.chainId) {
      chain = { ...chain, chainId, evm: { rpc }, cosmos: { rpc, rest: rpc } };
    },
  };
}
function wireTracer() {
  const instances: {
    endpoint: string;
    result: ReturnType<typeof deferred<any>>;
    traceTx: jest.Mock;
    close: jest.Mock;
    emit: (name: "close" | "error") => void;
  }[] = [];
  tracerMock.mockImplementation((endpoint) => {
    const listeners = new Map<string, () => void>();
    const result = deferred<any>();
    const tracer = {
      endpoint,
      result,
      addEventListener: (name: string, listener: () => void) =>
        listeners.set(name, listener),
      traceTx: jest.fn(() => result.promise),
      close: jest.fn(() => listeners.get("close")?.()),
      emit: (name: "close" | "error") => listeners.get(name)?.(),
    };
    instances.push(tracer);
    return tracer;
  });
  return instances;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("captures one EVM broadcast while later receipt reads use the current same-chain endpoint", async () => {
  const f = fixture("evm");
  const broadcast = deferred<any>();
  const receipt = { transactionHash: "0xabc", status: "0x1" };
  fetchMock
    .mockReturnValueOnce(broadcast.promise)
    .mockResolvedValue({ data: { result: receipt } });
  const onFulfill = jest.fn();
  const service = new BackgroundTxEthereumService(f.chains, f.notification);
  const sent = service.sendEthereumTx(
    "https://dapp.test",
    f.chainId,
    new Uint8Array([1, 2]),
    { onFulfill }
  );
  expect(fetchMock.mock.calls[0][0]).toBe("https://a.test");
  f.move("https://b.test");
  broadcast.resolve({ data: { result: "0xabc" } });
  await expect(sent).resolves.toBe("0xabc");
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const sentBody = JSON.parse(fetchMock.mock.calls[0][2].body);
  expect(sentBody).toMatchObject({
    method: "eth_sendRawTransaction",
    params: ["0x0102"],
  });
  expect(fetchMock.mock.calls[1][0]).toBe("https://b.test");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
    method: "eth_getTransactionReceipt",
    params: ["0xabc"],
  });
  expect(onFulfill).toHaveBeenCalledTimes(1);
  expect(onFulfill).toHaveBeenCalledWith(receipt);
});

it("retries rejected and pending EVM reads without hanging, preserving the original hash", async () => {
  const f = fixture("evm");
  const receipt = { transactionHash: "0xabc" };
  fetchMock
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ data: { result: null } })
    .mockResolvedValueOnce({ data: { result: receipt } });
  const service = new BackgroundTxEthereumService(f.chains, f.notification);
  const pending = service.getEthereumTxReceipt("origin", f.chainId, "0xabc");
  await flush();
  f.move("https://b.test");
  await advance(500);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await advance(1000);
  await expect(pending).resolves.toEqual(receipt);
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    "https://a.test",
    "https://b.test",
    "https://b.test",
  ]);
  for (const call of fetchMock.mock.calls)
    expect(JSON.parse(call[1].body).params).toEqual(["0xabc"]);
});

it("settles exhausted receipt reads and never follows a changed full network ID", async () => {
  const f = fixture("evm");
  fetchMock.mockRejectedValue(new Error("offline"));
  const service = new BackgroundTxEthereumService(f.chains, f.notification);
  const pending = service.getEthereumTxReceipt("origin", f.chainId, "0xabc");
  const rejection = expect(pending).rejects.toThrow("network has changed");
  await flush();
  f.move("https://other-network.test", "eip155:1");
  for (let n = 0; n < 50; n++) await advance(15000);
  await rejection;
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(["evm", "cosmos"] as const)(
  "reports an ambiguous %s broadcast without retrying it",
  async (type) => {
    const f = fixture(type);
    fetchMock.mockRejectedValue(new Error("connection lost"));
    const send =
      type === "evm"
        ? new BackgroundTxEthereumService(
            f.chains,
            f.notification
          ).sendEthereumTx("origin", f.chainId, new Uint8Array([1]), {})
        : new BackgroundTxService(f.chains, f.notification).sendTx(
            f.chainId,
            new Uint8Array([1]),
            "sync",
            {}
          );
    await expect(send).rejects.toThrow("submission outcome is unknown");
    f.move("https://b.test");
    await advance(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(f.notification.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Tx status unknown" })
    );
  }
);

it.each(["evm", "cosmos"] as const)(
  "keeps a confirmed %s rejection distinct from an unknown submission",
  async (type) => {
    const f = fixture(type);
    fetchMock.mockResolvedValue({
      data:
        type === "evm"
          ? { error: new Error("rejected") }
          : { tx_response: { code: 5, raw_log: "rejected" } },
    });
    const send =
      type === "evm"
        ? new BackgroundTxEthereumService(
            f.chains,
            f.notification
          ).sendEthereumTx("origin", f.chainId, new Uint8Array([1]), {})
        : new BackgroundTxService(f.chains, f.notification).sendTx(
            f.chainId,
            new Uint8Array([1]),
            "sync",
            {}
          );
    await expect(send).rejects.toThrow("rejected");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(f.notification.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Tx failed" })
    );
  }
);

it("keeps one Cosmos submission and cleans failed tracers before looking up the same hash at a new endpoint", async () => {
  const f = fixture("cosmos");
  const tracers = wireTracer();
  const broadcast = deferred<any>();
  fetchMock.mockReturnValueOnce(broadcast.promise);
  const onFulfill = jest.fn();
  const sent = new BackgroundTxService(f.chains, f.notification).sendTx(
    f.chainId,
    new Uint8Array([1, 2]),
    "sync",
    { waitFulfillment: true, onFulfill }
  );
  f.move("https://b.test");
  broadcast.resolve({ data: { tx_response: { txhash: "ABCD", code: 0 } } });
  await flush();
  expect(tracers[0].endpoint).toBe("https://b.test");
  tracers[0].emit("close");
  tracers[0].emit("error");
  await flush();
  expect(tracers[0].close).toHaveBeenCalledTimes(1);
  // A stale result cannot fulfill the next lookup or cause another submission.
  tracers[0].result.resolve({ code: 0, stale: true });
  f.move("https://c.test");
  await advance(10000);
  expect(tracers).toHaveLength(2);
  expect(tracers[1].endpoint).toBe("https://c.test");
  tracers[1].result.resolve({ code: 0 });
  expect(Buffer.from(await sent).toString("hex")).toBe("abcd");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("https://a.test");
  expect(JSON.parse(fetchMock.mock.calls[0][2].body)).toMatchObject({
    tx_bytes: "AQI=",
    mode: "BROADCAST_MODE_SYNC",
  });
  for (const tracer of tracers)
    expect(Buffer.from(tracer.traceTx.mock.calls[0][0]).toString("hex")).toBe(
      "abcd"
    );
  expect(onFulfill).toHaveBeenCalledTimes(1);
  expect(onFulfill.mock.calls[0][0].stale).toBeUndefined();
  expect(tracers[1].close).toHaveBeenCalledTimes(1);
});

it("handles a rejected Cosmos trace promise and clears its close timer on success", async () => {
  const f = fixture("cosmos");
  const tracers = wireTracer();
  const pending = new BackgroundTxService(f.chains, f.notification).traceTx(
    f.chainId,
    "ABCD"
  );
  tracers[0].result.reject(new Error("lookup failed"));
  await flush();
  expect(tracers[0].close).toHaveBeenCalledTimes(1);
  f.move("https://b.test");
  await advance(10000);
  tracers[1].emit("close");
  tracers[1].result.resolve({ code: 0 });
  await expect(pending).resolves.toEqual({ code: 0 });
  expect(tracers[1].endpoint).toBe("https://b.test");
});

it("a local encoding failure neither dispatches nor reports an unknown submission", async () => {
  const f = fixture("cosmos");
  const tx: { self?: unknown } = {};
  tx.self = tx;
  await expect(
    new BackgroundTxService(f.chains, f.notification).sendTx(
      f.chainId,
      tx,
      "sync",
      {}
    )
  ).rejects.toThrow("circular");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(f.notification.create).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: "Tx failed" })
  );
  expect(
    f.notification.create.mock.calls.some(([notice]) =>
      notice.message.includes("outcome is unknown")
    )
  ).toBe(false);
});

it.each(["evm", "cosmos"] as const)(
  "%s late-start receipt lookup rejects an explicit old revision but accepts its bare identifier",
  async (type) => {
    const f = fixture(type === "evm" ? "ethermint" : "cosmos");
    f.move("https://new.test", "epix_1916-2");
    if (type === "evm") {
      const service = new BackgroundTxEthereumService(f.chains, f.notification);
      await expect(
        service.getEthereumTxReceipt("origin", "epix_1916-1", "0xabc")
      ).rejects.toThrow("network has changed");
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockResolvedValueOnce({
        data: { result: { transactionHash: "0xabc" } },
      });
      await expect(
        service.getEthereumTxReceipt("origin", "epix_1916", "0xabc")
      ).resolves.toMatchObject({ transactionHash: "0xabc" });
    } else {
      const tracers = wireTracer();
      const service = new BackgroundTxService(f.chains, f.notification);
      await expect(service.traceTx("epix_1916-1", "ABCD")).rejects.toThrow(
        "network has changed"
      );
      expect(tracers).toHaveLength(0);
      const pending = service.traceTx("epix_1916", "ABCD");
      tracers[0].result.resolve({ code: 0 });
      await expect(pending).resolves.toEqual({ code: 0 });
    }
  }
);

it.each(["evm", "cosmos"] as const)(
  "%s held receipt cannot complete after a revision changes",
  async (type) => {
    const f = fixture(type === "evm" ? "ethermint" : "cosmos");
    f.move("https://a.test", "epix_1916-1");
    if (type === "evm") {
      const held = deferred<any>();
      fetchMock.mockReturnValueOnce(held.promise);
      const pending = new BackgroundTxEthereumService(
        f.chains,
        f.notification
      ).getEthereumTxReceipt("origin", "epix_1916-1", "0xabc");
      const rejected = expect(pending).rejects.toThrow("network has changed");
      f.move("https://b.test", "epix_1916-2");
      held.resolve({ data: { result: { transactionHash: "0xabc" } } });
      await flush();
      for (let i = 0; i < 50; i++) await advance(15000);
      await rejected;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } else {
      const tracers = wireTracer();
      const pending = new BackgroundTxService(f.chains, f.notification).traceTx(
        "epix_1916-1",
        "ABCD"
      );
      const rejected = expect(pending).rejects.toThrow("network has changed");
      f.move("https://b.test", "epix_1916-2");
      tracers[0].result.resolve({ code: 0 });
      await flush();
      for (let i = 0; i < 10; i++) await advance(300000);
      await rejected;
      expect(tracers).toHaveLength(1);
      expect(tracers[0].close).toHaveBeenCalledTimes(1);
    }
  }
);
