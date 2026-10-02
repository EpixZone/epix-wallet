import { KVStore } from "@keplr-wallet/common";
import { Env } from "@keplr-wallet/router";
import { webcrypto } from "crypto";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { MsgTransfer } from "@keplr-wallet/proto-types/ibc/applications/transfer/v1/tx";
import { MsgSwapExactAmountIn } from "@keplr-wallet/proto-types/osmosis/poolmanager/v1beta1/tx";
import { EpixSwapService } from "./service";
import { PrepareEpixSwapMsg } from "./messages";
import { EpixSwapOperation } from "./types";
import { SwapTransactions } from "./transactions";
import { OSMOSIS_EPIX_DENOM, APPROVAL_DURATION_MS } from "./plan";
import * as network from "./network";
import {
  OSMOSIS_ALL_BTC_DENOM,
  OSMOSIS_ALL_USDC_DENOM,
  OSMOSIS_ALL_USDT_DENOM,
  OSMOSIS_USDC_DENOM,
} from "./constants";

const realImmediate =
  jest.requireActual<typeof import("timers")>("timers").setImmediate;
async function advance(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await new Promise<void>((resolve) => realImmediate(resolve));
}
const env = { isInternalMsg: true } as Env;
const amount = "1000000000000000000";
const bridgeHash = bytesToHex(sha256(new Uint8Array([1]))).toUpperCase();
const request = (resume?: string) =>
  new PrepareEpixSwapMsg("vault", amount, "uosmo", 100, "uosmo", resume);

// Model extension storage's serialized boundary. Native structuredClone returns
// Node-realm objects in Jest; MemoryKVStore's constructor identity check rejects
// those valid records even though browser storage accepts them.
class SerializedStore implements KVStore {
  private readonly values = new Map<string, string>();
  prefix(): string {
    return "swap-test";
  }
  get<T>(key: string): Promise<T | undefined> {
    const encoded = this.values.get(key);
    return Promise.resolve(
      encoded === undefined ? undefined : (JSON.parse(encoded) as T)
    );
  }
  set<T>(key: string, value: T | null): Promise<void> {
    this.values.set(key, JSON.stringify(value));
    return Promise.resolve();
  }
}

async function fixture() {
  const store = new SerializedStore();
  const transactions: jest.Mocked<SwapTransactions> = {
    context: jest.fn().mockResolvedValue({
      sourceAddress: "epix1source",
      destinationAddress: "osmo1destination",
      sourceRest: "https://epix.test",
      destinationRest: "https://osmosis.test",
      bridgeGasPrice: "25000000000",
      software: true,
      enabled: true,
    }),
    assertContext: jest.fn(),
    watchContext: jest.fn(),
    simulate: jest.fn().mockResolvedValue("100000"),
    sign: jest.fn().mockImplementation(async (_op, step, _msg, _fee, guard) => {
      guard();
      return new Uint8Array([step === "bridge" ? 1 : 2]);
    }),
    broadcast: jest
      .fn()
      .mockImplementation(async (_step, bytes) => sha256(bytes)),
  };
  const api = {
    ...network,
    validateBridgeRoute: jest.fn().mockResolvedValue(undefined),
    fetchSwapQuote: jest.fn().mockImplementation(async ({ outputDenom }) => ({
      amountOut: "1000",
      minimumAmountOut: "990",
      routes: [{ poolId: "1", tokenOutDenom: outputDenom }],
      expiresAt: Date.now() + 30000,
    })),
    getOsmosisFeeQuote: jest
      .fn()
      .mockImplementation(async ({ gasLimit, feeDenom }) => ({
        fee: {
          gas: String(gasLimit),
          amount: [
            { denom: feeDenom, amount: String(Math.ceil(gasLimit * 0.036)) },
          ],
        },
        gasPrice: "0.036",
        expiresAt: Date.now() + 30000,
      })),
    readBalance: jest
      .fn()
      .mockImplementation(async (rest, _address, denom) =>
        rest === "https://osmosis.test" && denom === OSMOSIS_EPIX_DENOM
          ? amount
          : "1000000000000000000000"
      ),
    packetAck: jest.fn().mockResolvedValue("pending" as const),
    lookupTx: jest.fn().mockImplementation(async (_rest, hash) => {
      if (hash !== bridgeHash) return { code: 0, events: [] };
      const [op] = (await store.get<EpixSwapOperation[]>("operations"))!;
      return {
        code: 0,
        events: [
          {
            type: "send_packet",
            attributes: Object.entries({
              packet_src_port: "transfer",
              packet_src_channel: "channel-0",
              packet_dst_port: "transfer",
              packet_dst_channel: "channel-108456",
              packet_sequence: "7",
              packet_timeout_timestamp: op.packetTimeoutTimestamp!,
              packet_data: JSON.stringify({
                sender: op.sourceAddress,
                receiver: op.destinationAddress,
                denom: "aepix",
                amount: op.amountIn,
              }),
            }).map(([key, value]) => ({ key, value })),
          },
        ],
      };
    }),
  };
  const service = new EpixSwapService(store, transactions, api);
  await service.init();
  return { store, transactions, api, service };
}

async function begin(f: Awaited<ReturnType<typeof fixture>>, msg = request()) {
  const review = await f.service.prepare(env, msg);
  expect(review.canStart).toBe(true);
  const operation = await f.service.start(env, review.id);
  await advance(0);
  return operation;
}

beforeEach(() => {
  if (!globalThis.crypto)
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
    });
  jest.useFakeTimers({ now: Date.UTC(2026, 9, 1) });
});
afterEach(() => {
  jest.useRealTimers();
});

it.each([
  ["OSMO", "uosmo"],
  ["allBTC", OSMOSIS_ALL_BTC_DENOM],
  ["allUSDT", OSMOSIS_ALL_USDT_DENOM],
  ["allUSDC", OSMOSIS_ALL_USDC_DENOM],
])(
  "one approval deposits once and swaps to %s with the exact approved amount and minimum",
  async (_label, outputDenom) => {
    const f = await fixture();
    const operation = await begin(
      f,
      new PrepareEpixSwapMsg("vault", amount, outputDenom, 100, "uosmo")
    );
    expect(f.transactions.broadcast).toHaveBeenCalledTimes(1);
    const bridge = MsgTransfer.decode(
      f.transactions.sign.mock.calls[0][2].value
    );
    expect(bridge).toMatchObject({
      sender: "epix1source",
      receiver: "osmo1destination",
      sourceChannel: "channel-0",
      token: { denom: "aepix", amount },
    });
    expect(f.service.getOperations(env, "vault")[0].depositConfirmed).toBe(
      false
    );
    f.api.packetAck.mockResolvedValue("received" as never);
    await advance(5000);
    expect(f.transactions.broadcast).toHaveBeenCalledTimes(2);
    const swap = MsgSwapExactAmountIn.decode(
      f.transactions.sign.mock.calls[1][2].value
    );
    expect(swap).toMatchObject({
      sender: "osmo1destination",
      tokenIn: { denom: OSMOSIS_EPIX_DENOM, amount },
      tokenOutMinAmount: "990",
      routes: [{ poolId: "1", tokenOutDenom: outputDenom }],
    });
    await advance(5000);
    expect(f.service.getOperations(env, "vault")[0]).toMatchObject({
      id: operation.id,
      status: "complete",
      depositConfirmed: true,
      outputDenom,
    });
    const stored = JSON.stringify(await f.store.get("operations"));
    expect(stored).not.toMatch(
      /signedTx|signature|privateKey|bodyBytes|authInfoBytes/
    );
  }
);

it.each([
  ["native USDC output", OSMOSIS_USDC_DENOM, "uosmo"],
  [
    "different factory issuer",
    OSMOSIS_ALL_USDT_DENOM.replace("osmo1em6", "osmo1other"),
    "uosmo",
  ],
  ["allUSDT fee", "uosmo", OSMOSIS_ALL_USDT_DENOM],
  ["allUSDC fee", "uosmo", OSMOSIS_ALL_USDC_DENOM],
])(
  "rejects %s before quoting or authorization",
  async (_label, outputDenom, feeDenom) => {
    const f = await fixture();
    await expect(
      f.service.prepare(
        env,
        new PrepareEpixSwapMsg("vault", amount, outputDenom, 100, feeDenom)
      )
    ).rejects.toThrow("Unsupported swap asset");
    expect(f.api.fetchSwapQuote).not.toHaveBeenCalled();
    expect(f.api.getOsmosisFeeQuote).not.toHaveBeenCalled();
    expect(f.transactions.sign).not.toHaveBeenCalled();
  }
);

it.each([OSMOSIS_USDC_DENOM, OSMOSIS_ALL_BTC_DENOM, "uosmo"])(
  "keeps the existing fee asset %s available with a new alloyed output",
  async (feeDenom) => {
    const f = await fixture();
    const review = await f.service.prepare(
      env,
      new PrepareEpixSwapMsg(
        "vault",
        amount,
        OSMOSIS_ALL_USDT_DENOM,
        100,
        feeDenom
      )
    );
    expect(review.canStart).toBe(true);
    expect(review.swapFeeCap.amount[0].denom).toBe(feeDenom);
  }
);

it("copies the validated quote route for display and executes the fresh route after deposit", async () => {
  const f = await fixture();
  const quote = {
    amountOut: "1000",
    minimumAmountOut: "990",
    routes: [
      { poolId: "18446744073709551615", tokenOutDenom: "intermediate" },
      { poolId: "2", tokenOutDenom: "uosmo" },
    ],
    expiresAt: Date.now() + 30000,
  };
  f.api.fetchSwapQuote.mockResolvedValueOnce(quote);
  const review = await f.service.prepare(env, request());
  expect(review.bridgeComplete).toBe(false);
  expect(review.routes).toEqual(quote.routes);
  expect(review.routes).not.toBe(quote.routes);
  expect(review.routes?.[0]).not.toBe(quote.routes[0]);
  if (!review.routes) throw new Error("Missing preview route");
  review.routes[0].poolId = "999";
  review.routes[0].tokenOutDenom = "changed";
  expect(quote.routes[0]).toEqual({
    poolId: "18446744073709551615",
    tokenOutDenom: "intermediate",
  });

  await f.service.start(env, review.id);
  await advance(0);
  f.api.packetAck.mockResolvedValue("received" as never);
  await advance(5000);
  expect(f.api.fetchSwapQuote).toHaveBeenCalledTimes(2);
  const swap = MsgSwapExactAmountIn.decode(
    f.transactions.sign.mock.calls[1][2].value
  );
  expect(swap.routes).toEqual([{ poolId: "1", tokenOutDenom: "uosmo" }]);
  expect(swap.tokenOutMinAmount).toBe("990");
  expect(await f.store.get("operations")).toEqual([
    expect.not.objectContaining({ routes: expect.anything() }),
  ]);
});

it("rejects external callers and cannot start from a client-modified review", async () => {
  const f = await fixture();
  await expect(
    f.service.prepare({ isInternalMsg: false } as Env, request())
  ).rejects.toThrow("inside the wallet");
  const review = await f.service.prepare(env, request());
  review.amountIn = "999";
  review.minimumAmountOut = "1";
  await f.service.start(env, review.id);
  await advance(0);
  expect(f.transactions.sign.mock.calls[0][0].amountIn).toBe(amount);
  expect(f.transactions.sign.mock.calls[0][0].minimumAmountOut).toBe("990");
  await expect(f.service.start(env, review.id)).rejects.toThrow();
});

it("shows the quote but blocks a deposit without pre-existing Osmosis fee funds", async () => {
  const f = await fixture();
  f.api.readBalance.mockImplementation(async (_rest, _address, denom) =>
    denom === "uosmo" ? "0" : amount
  );
  const review = await f.service.prepare(env, request());
  expect(review.estimatedAmountOut).toBe("1000");
  expect(review.routes).toEqual([{ poolId: "1", tokenOutDenom: "uosmo" }]);
  expect(review.canStart).toBe(false);
  await expect(f.service.start(env, review.id)).rejects.toThrow();
  expect(f.transactions.sign).not.toHaveBeenCalled();
});

it("pauses after receipt when fresh output falls below the approved absolute minimum", async () => {
  const f = await fixture();
  await begin(f);
  f.api.packetAck.mockResolvedValue("received" as never);
  f.api.fetchSwapQuote.mockImplementation(async () => ({
    amountOut: "900",
    minimumAmountOut: "891",
    routes: [{ poolId: "1", tokenOutDenom: "uosmo" }],
    expiresAt: Date.now() + 30000,
  }));
  await advance(5000);
  expect(f.transactions.sign).toHaveBeenCalledTimes(1);
  expect(f.service.getOperations(env, "vault")[0]).toMatchObject({
    status: "paused",
    depositConfirmed: true,
  });
});

it("revokes signing across lock or account changes even when the wallet is unlocked again", async () => {
  const f = await fixture();
  await begin(f);
  f.transactions.watchContext.mock.calls[0][0]();
  f.api.packetAck.mockResolvedValue("received" as never);
  await advance(5000);
  expect(f.transactions.sign).toHaveBeenCalledTimes(1);
  expect(f.service.getOperations(env, "vault")[0].status).toBe("paused");
});

it("never retries an ambiguous broadcast, including after restart and read-only refresh", async () => {
  const f = await fixture();
  f.transactions.broadcast.mockRejectedValue(new Error("connection lost"));
  f.api.lookupTx.mockResolvedValue(undefined as never);
  const op = await begin(f);
  expect(f.service.getOperations(env, "vault")[0]).toMatchObject({
    status: "paused",
    bridgeTxHash: bridgeHash,
  });
  const restarted = new EpixSwapService(f.store, f.transactions, f.api);
  await restarted.init();
  await restarted.refresh(env, op.id);
  await expect(restarted.prepare(env, request(op.id))).rejects.toThrow(
    "unconfirmed"
  );
  await advance(60000);
  expect(f.transactions.sign).toHaveBeenCalledTimes(1);
  expect(f.transactions.broadcast).toHaveBeenCalledTimes(1);
});

it.each([OSMOSIS_ALL_USDT_DENOM, OSMOSIS_ALL_USDC_DENOM])(
  "a restart requires fresh consent before swapping a verified deposit to %s",
  async (outputDenom) => {
    const f = await fixture();
    const msg = new PrepareEpixSwapMsg(
      "vault",
      amount,
      outputDenom,
      100,
      "uosmo"
    );
    const op = await begin(f, msg);
    f.service.revokeApprovals();
    const restarted = new EpixSwapService(f.store, f.transactions, f.api);
    await restarted.init();
    f.api.packetAck.mockResolvedValue("received" as never);
    await restarted.refresh(env, op.id);
    expect(f.transactions.sign).toHaveBeenCalledTimes(1);
    const review = await restarted.prepare(
      env,
      new PrepareEpixSwapMsg("vault", amount, outputDenom, 100, "uosmo", op.id)
    );
    expect(review.bridgeComplete).toBe(true);
    expect(review.bridgeFee.gas).toBe("0");
    await restarted.start(env, review.id);
    await advance(0);
    expect(f.transactions.sign).toHaveBeenCalledTimes(2);
    expect(f.transactions.sign.mock.calls[1][1]).toBe("swap");
    const swap = MsgSwapExactAmountIn.decode(
      f.transactions.sign.mock.calls[1][2].value
    );
    expect(swap.routes.at(-1)?.tokenOutDenom).toBe(outputDenom);
    expect(swap.tokenOutMinAmount).toBe(review.minimumAmountOut);
  }
);

it("does not dispatch when durable hash storage fails or context changes after signing", async () => {
  const f = await fixture();
  const save = jest.spyOn(f.store, "set");
  save
    .mockImplementationOnce(async () => undefined)
    .mockRejectedValueOnce(new Error("disk unavailable"));
  await begin(f);
  expect(f.transactions.broadcast).not.toHaveBeenCalled();
  const g = await fixture();
  g.transactions.sign.mockImplementationOnce(async () => {
    g.service.revokeApprovals();
    return new Uint8Array([1]);
  });
  await begin(g);
  expect(g.transactions.broadcast).not.toHaveBeenCalled();
});

it("rejects a higher gas or fee requirement and expired reviews", async () => {
  const f = await fixture();
  const review = await f.service.prepare(env, request());
  await advance(30001);
  await expect(f.service.start(env, review.id)).rejects.toThrow("expired");
  await begin(f);
  f.api.packetAck.mockResolvedValue("received" as never);
  f.transactions.simulate.mockResolvedValue("2000000");
  await advance(5000);
  expect(f.transactions.sign).toHaveBeenCalledTimes(1);
  expect(f.service.getOperations(env, "vault")[0].error).toContain("more gas");
});

it("stops approval after its bounded lifetime without resending an unresolved deposit", async () => {
  const f = await fixture();
  await begin(f);
  f.api.lookupTx.mockResolvedValue(undefined as never);
  await advance(APPROVAL_DURATION_MS);
  expect(f.transactions.sign).toHaveBeenCalledTimes(1);
  expect(f.service.getOperations(env, "vault")[0].status).toBe("paused");
});

it("pauses a failed initial save so recovery does not look like a running transaction", async () => {
  const f = await fixture();
  const review = await f.service.prepare(env, request());
  jest
    .spyOn(f.store, "set")
    .mockRejectedValueOnce(new Error("storage failure"));
  await expect(f.service.start(env, review.id)).rejects.toThrow(
    "storage failure"
  );
  expect(f.service.getOperations(env, "vault")[0]).toMatchObject({
    status: "paused",
    error: "storage failure",
  });
  expect(f.transactions.sign).not.toHaveBeenCalled();
});

it("invalidates all other prepared resume reviews before a route can finish and be replayed", async () => {
  const f = await fixture();
  const op = await begin(f);
  f.service.revokeApprovals();
  await advance(5000);
  f.api.packetAck.mockResolvedValue("received" as never);
  const first = await f.service.prepare(env, request(op.id));
  const stale = await f.service.prepare(env, request(op.id));
  await f.service.start(env, first.id);
  await advance(0);
  await advance(5000);
  expect(f.service.getOperations(env, "vault")[0].status).toBe("complete");
  await expect(f.service.start(env, stale.id)).rejects.toThrow("expired");
  expect(f.transactions.broadcast).toHaveBeenCalledTimes(2);
});

it("renews the packet timeout only for a fresh approval of a definitely unsent deposit", async () => {
  const f = await fixture();
  f.transactions.simulate.mockRejectedValueOnce(
    new Error("simulation unavailable")
  );
  const op = await begin(f);
  expect(f.transactions.sign).not.toHaveBeenCalled();
  await advance(11 * 60 * 1000);
  const review = await f.service.prepare(env, request(op.id));
  await f.service.start(env, review.id);
  await advance(0);
  const bridge = MsgTransfer.decode(f.transactions.sign.mock.calls[0][2].value);
  expect(BigInt(bridge.timeoutTimestamp)).toBeGreaterThan(
    BigInt(Date.now()) * BigInt(1000000)
  );
});

it("rejects stored signing material at any allowed fee nesting level", async () => {
  const f = await fixture();
  await begin(f);
  const [saved] = (await f.store.get<EpixSwapOperation[]>("operations"))!;
  const malformed = {
    ...saved,
    bridgeFee: { ...saved.bridgeFee, signature: "not public progress" },
  };
  await f.store.set("operations", [malformed]);
  const restarted = new EpixSwapService(f.store, f.transactions, f.api);
  await restarted.init();
  await expect(restarted.prepare(env, request())).rejects.toThrow(
    "recovery data"
  );
});

it("coalesces read-only recovery lookups and never signs from Refresh", async () => {
  const f = await fixture();
  const op = await begin(f);
  f.service.revokeApprovals();
  await advance(5000);
  f.api.lookupTx.mockClear();
  await Promise.all([
    f.service.refresh(env, op.id),
    f.service.refresh(env, op.id),
  ]);
  expect(f.api.lookupTx).toHaveBeenCalledTimes(1);
  expect(f.transactions.sign).toHaveBeenCalledTimes(1);
});

it("keeps a successfully dispatched hash paused when approval is revoked during broadcast", async () => {
  const f = await fixture();
  f.transactions.broadcast.mockImplementationOnce(async (_step, bytes) => {
    f.service.revokeApprovals();
    return sha256(bytes);
  });
  const op = await begin(f);
  expect(f.service.getOperations(env, "vault")[0]).toMatchObject({
    id: op.id,
    status: "paused",
    bridgeTxHash: bridgeHash,
  });
  f.api.packetAck.mockResolvedValue("received" as never);
  await f.service.refresh(env, op.id);
  expect(f.service.getOperations(env, "vault")[0]).toMatchObject({
    status: "paused",
    depositConfirmed: true,
  });
  await advance(60000);
  expect(f.transactions.sign).toHaveBeenCalledTimes(1);
  expect(f.transactions.broadcast).toHaveBeenCalledTimes(1);
});
