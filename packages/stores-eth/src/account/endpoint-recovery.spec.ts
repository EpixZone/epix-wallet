import { EthereumAccountBase } from "./base";
import { EthSignType, Keplr } from "@keplr-wallet/types";
import { ChainGetter } from "@keplr-wallet/stores";

const realImmediate =
  jest.requireActual<typeof import("timers")>("timers").setImmediate;
const flush = () => new Promise<void>((resolve) => realImmediate(resolve));

it("keeps one signature and submission when a rejected receipt read recovers", async () => {
  jest.useFakeTimers();
  const errorLog = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const signature = new Uint8Array(65);
  signature[31] = 1;
  signature[63] = 1;
  signature[64] = 27;
  const receipt = { transactionHash: "0xabc" };
  let endpoint = "https://a.test";
  const readEndpoints: string[] = [];
  const request = jest.fn(async ({ method }) => {
    if (method === "eth_getTransactionCount") return "0x7";
    readEndpoints.push(endpoint);
    if (readEndpoints.length === 1) throw new Error("offline");
    return receipt;
  });
  const keplr = {
    ethereum: { request },
    signEthereum: jest.fn(async () => signature),
    sendEthereumTx: jest.fn(async () => "0xabc"),
  };
  const chainGetter = {
    getModularChain: () => ({
      unwrapped: { type: "evm", chainId: "eip155:1916" },
    }),
  };
  const account = new EthereumAccountBase(
    chainGetter as unknown as ChainGetter,
    "eip155:1916",
    async () => keplr as unknown as Keplr
  );
  const events = {
    onBroadcasted: jest.fn(),
    onBroadcastFailed: jest.fn(),
    onFulfill: jest.fn(),
  };
  const tx = {
    chainId: 1916,
    to: `0x${"12".repeat(20)}`,
    gasLimit: 21000,
    gasPrice: 1,
    value: 2,
  };
  try {
    await expect(
      account.sendEthereumTx(`0x${"34".repeat(20)}`, tx, events)
    ).resolves.toBe("0xabc");
    await flush();
    endpoint = "https://b.test";
    jest.advanceTimersByTime(500);
    await flush();
    expect(keplr.signEthereum).toHaveBeenCalledTimes(1);
    expect(keplr.signEthereum).toHaveBeenCalledWith(
      "eip155:1916",
      `0x${"34".repeat(20)}`,
      JSON.stringify({ ...tx, nonce: 7 }),
      EthSignType.TRANSACTION
    );
    expect(keplr.sendEthereumTx).toHaveBeenCalledTimes(1);
    expect(readEndpoints).toEqual(["https://a.test", "https://b.test"]);
    expect(request.mock.calls.slice(1)).toEqual(
      Array(2).fill([
        {
          method: "eth_getTransactionReceipt",
          params: ["0xabc"],
          chainId: "eip155:1916",
        },
      ])
    );
    expect(events.onBroadcasted).toHaveBeenCalledWith("0xabc");
    expect(events.onBroadcastFailed).not.toHaveBeenCalled();
    expect(events.onFulfill).toHaveBeenCalledTimes(1);
    expect(events.onFulfill).toHaveBeenCalledWith(receipt);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
    errorLog.mockRestore();
  }
});

it.each([
  ["broadcast", true],
  ["broadcast", false],
  ["receipt", true],
  ["receipt", false],
] as const)(
  "foreground receipt identity at held %s (revision changes: %s)",
  async (boundary, revisionChanges) => {
    jest.useFakeTimers();
    const errorLog = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const signature = new Uint8Array(65);
    signature[31] = 1;
    signature[63] = 1;
    signature[64] = 27;
    let chainId = "epix_1916-1";
    let endpoint = "https://a.test";
    let releaseBroadcast!: (hash: string) => void;
    let releaseReceipt!: (receipt: unknown) => void;
    const broadcast = new Promise<string>((resolve) => {
      releaseBroadcast = resolve;
    });
    const heldReceipt = new Promise<unknown>((resolve) => {
      releaseReceipt = resolve;
    });
    const receipt = { transactionHash: "0xabc" };
    const reads: { chainId: string; endpoint: string }[] = [];
    const request = jest.fn(async (req) => {
      if (req.method === "eth_getTransactionCount") return "0x7";
      reads.push({ chainId: req.chainId, endpoint });
      return heldReceipt;
    });
    const keplr = {
      ethereum: { request },
      signEthereum: jest.fn(async () => signature),
      sendEthereumTx: jest.fn(() => broadcast),
    };
    const getter = {
      getModularChain: () => ({ unwrapped: { type: "ethermint", chainId } }),
    };
    const account = new EthereumAccountBase(
      getter as unknown as ChainGetter,
      "epix_1916-1",
      async () => keplr as unknown as Keplr
    );
    const events = {
      onBroadcastFailed: jest.fn(),
      onBroadcasted: jest.fn(),
      onFulfill: jest.fn(),
    };
    const change = () => {
      endpoint = "https://b.test";
      if (revisionChanges) chainId = "epix_1916-2";
    };
    try {
      const sent = account.sendEthereumTx(
        `0x${"34".repeat(20)}`,
        {
          chainId: 1916,
          to: `0x${"12".repeat(20)}`,
          gasLimit: 21000,
          gasPrice: 1,
          value: 2,
        },
        events
      );
      await flush();
      if (boundary === "broadcast") change();
      releaseBroadcast("0xabc");
      await expect(sent).resolves.toBe("0xabc");
      await flush();
      if (boundary === "receipt") change();
      releaseReceipt(receipt);
      await flush();
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(4000);
        await flush();
      }
      expect(keplr.signEthereum).toHaveBeenCalledTimes(1);
      expect(keplr.sendEthereumTx).toHaveBeenCalledTimes(1);
      expect(events.onBroadcasted).toHaveBeenCalledWith("0xabc");
      expect(events.onBroadcastFailed).not.toHaveBeenCalled();
      expect(events.onFulfill).toHaveBeenCalledTimes(revisionChanges ? 0 : 1);
      expect(reads).toHaveLength(
        revisionChanges && boundary === "broadcast" ? 0 : 1
      );
      for (const read of reads) expect(read.chainId).toBe("epix_1916-1");
      if (!revisionChanges)
        expect(events.onFulfill).toHaveBeenCalledWith(receipt);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      releaseBroadcast("0xabc");
      releaseReceipt(receipt);
      jest.useRealTimers();
      errorLog.mockRestore();
    }
  }
);
