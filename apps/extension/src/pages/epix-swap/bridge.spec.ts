import { Bech32Address } from "@keplr-wallet/cosmos";
import { CosmosAccountImpl, defaultCosmosMsgOpts } from "@keplr-wallet/stores";
import { Int } from "@keplr-wallet/unit";
import { createHash } from "node:crypto";
import { MsgTransfer } from "@keplr-wallet/proto-types/ibc/applications/transfer/v1/tx";
import {
  EPIX_BRIDGE_ENDPOINTS,
  EPIX_CURRENCY,
  OSMOSIS_EPIX_CURRENCY,
  parseAmountToMinimal,
  prepareEpixBridgeTx,
  validateEpixBridgeRoute,
  getEpixBridgePacketSequence,
  getEpixBridgePacketStatus,
} from "./bridge";

const epixAddress = new Bech32Address(new Uint8Array(20).fill(1)).toBech32(
  "epix"
);
const osmosisAddress = new Bech32Address(new Uint8Array(20).fill(2)).toBech32(
  "osmo"
);
const originalFetch = global.fetch;

function validResponse(url: string): unknown {
  const epix = url.startsWith(EPIX_BRIDGE_ENDPOINTS.epix);
  if (url.includes("client_status")) return { status: "Active" };
  if (url.endsWith("client_state")) {
    return {
      identified_client_state: {
        client_id: epix ? "07-tendermint-0" : "07-tendermint-3641",
        client_state: { chain_id: epix ? "osmosis-1" : "epix_1916-1" },
      },
    };
  }
  return {
    channel: {
      state: "STATE_OPEN",
      ordering: "ORDER_UNORDERED",
      version: "ics20-1",
      counterparty: {
        port_id: "transfer",
        channel_id: epix ? "channel-108456" : "channel-0",
      },
    },
  };
}

function mockFetch(
  transform: (url: string, response: any) => unknown = (_, r) => r
) {
  const mock = jest.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => transform(url, validResponse(url)),
  }));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("IBC delivery acknowledgement", () => {
  function packetEvent(sequence: string, encoded = false) {
    const attributes = {
      packet_src_port: "transfer",
      packet_src_channel: "channel-0",
      packet_dst_port: "transfer",
      packet_dst_channel: "channel-108456",
      packet_sequence: sequence,
    };
    const encode = (value: string) =>
      encoded ? Buffer.from(value).toString("base64") : value;
    return {
      type: "send_packet",
      attributes: Object.entries(attributes).map(([key, value]) => ({
        key: encode(key),
        value: encode(value),
      })),
    };
  }

  it.each([false, true])(
    "reads the exact direct-route packet (base64=%s)",
    (encoded) => {
      expect(
        getEpixBridgePacketSequence("deposit", [packetEvent("123", encoded)])
      ).toBe("123");
      expect(
        getEpixBridgePacketSequence("withdraw", [packetEvent("123", encoded)])
      ).toBeUndefined();
    }
  );

  it("rejects ambiguous and invalid sequences", () => {
    expect(
      getEpixBridgePacketSequence("deposit", [
        packetEvent("1"),
        packetEvent("2"),
      ])
    ).toBeUndefined();
    expect(
      getEpixBridgePacketSequence("deposit", [
        packetEvent("18446744073709551616"),
      ])
    ).toBeUndefined();
  });

  it("confirms only the exact ICS-20 success acknowledgement commitment", async () => {
    const acknowledgement = createHash("sha256")
      .update('{"result":"AQ=="}')
      .digest("base64");
    const fetch = mockFetch(() => ({ acknowledgement }));
    await expect(getEpixBridgePacketStatus("deposit", "123")).resolves.toBe(
      "received"
    );
    expect(fetch.mock.calls[0][0]).toBe(
      "https://lcd.osmosis.zone/ibc/core/channel/v1/channels/channel-108456/ports/transfer/packet_acks/123"
    );
    mockFetch(() => ({
      acknowledgement: createHash("sha256")
        .update('{"error":"invalid receiver"}')
        .digest("base64"),
    }));
    await expect(getEpixBridgePacketStatus("deposit", "123")).resolves.toBe(
      "unknown"
    );
  });

  it("distinguishes a pending packet from an unavailable endpoint", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(getEpixBridgePacketStatus("withdraw", "123")).resolves.toBe(
      "pending"
    );
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(getEpixBridgePacketStatus("withdraw", "123")).rejects.toThrow(
      "HTTP 503"
    );
  });
});

describe("exact bridge amounts", () => {
  it("preserves one aepix beyond one EPIX and large integral amounts", () => {
    expect(parseAmountToMinimal("1.000000000000000001", 18)).toBe(
      "1000000000000000001"
    );
    expect(parseAmountToMinimal("9007199254740993", 18)).toBe(
      "9007199254740993000000000000000000"
    );
    expect(parseAmountToMinimal("0.000001", 6)).toBe("1");
  });

  it.each(["0", "-1", "1e3", "NaN", "Infinity", " 1", "1.0000000000000000001"])(
    "rejects invalid or lossy input %s",
    (amount) => expect(() => parseAmountToMinimal(amount, 18)).toThrow()
  );

  it("bounds parsing and the Cosmos 256-bit integer range", () => {
    expect(() => parseAmountToMinimal("9".repeat(10000), 18)).toThrow();
    expect(() => parseAmountToMinimal("9".repeat(78), 0)).toThrow();
    expect(() => parseAmountToMinimal("1", 19)).toThrow();
  });
});

describe("verified Epix bridge preparation", () => {
  it("checks both channel ends and both active clients", async () => {
    const fetch = mockFetch();
    await validateEpixBridgeRoute("deposit");
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        "https://api.epix.zone/ibc/core/client/v1/client_status/07-tendermint-0",
        "https://lcd.osmosis.zone/ibc/core/client/v1/client_status/07-tendermint-3641",
      ])
    );
  });

  it.each(["closed", "wrong-channel", "wrong-chain", "expired"])(
    "rejects a %s route before preparing a transaction",
    async (fault) => {
      mockFetch((url, response) => {
        if (url.startsWith(EPIX_BRIDGE_ENDPOINTS.epix)) {
          if (fault === "closed" && response.channel)
            response.channel.state = "STATE_CLOSED";
          if (fault === "wrong-channel" && response.channel)
            response.channel.counterparty.channel_id = "channel-9";
          if (fault === "wrong-chain" && response.identified_client_state)
            response.identified_client_state.client_state.chain_id = "other-1";
          if (fault === "expired" && response.status)
            response.status = "Expired";
        }
        return response;
      });
      const makeIBCTransferTx = jest.fn();
      await expect(
        prepareEpixBridgeTx({
          direction: "deposit",
          amount: "1",
          recipient: osmosisAddress,
          account: {
            bech32Address: epixAddress,
            cosmos: { makeIBCTransferTx },
          },
        })
      ).rejects.toThrow();
      expect(makeIBCTransferTx).not.toHaveBeenCalled();
    }
  );

  it("passes exact withdrawal currency and the actual Epix account recipient", async () => {
    mockFetch();
    const makeIBCTransferTx = jest.fn();
    await prepareEpixBridgeTx({
      direction: "withdraw",
      amount: "1.000000000000000001",
      recipient: epixAddress,
      account: { bech32Address: osmosisAddress, cosmos: { makeIBCTransferTx } },
    });
    expect(makeIBCTransferTx).toHaveBeenCalledWith(
      {
        portId: "transfer",
        channelId: "channel-108456",
        counterpartyChainId: "epix_1916-1",
      },
      "1.000000000000000001",
      OSMOSIS_EPIX_CURRENCY,
      epixAddress
    );
  });

  it("rejects a source account change while route verification is pending", async () => {
    const account = {
      bech32Address: epixAddress,
      cosmos: { makeIBCTransferTx: jest.fn() },
    };
    mockFetch((_, response) => {
      account.bech32Address = new Bech32Address(
        new Uint8Array(20).fill(3)
      ).toBech32("epix");
      return response;
    });
    await expect(
      prepareEpixBridgeTx({
        direction: "deposit",
        amount: "1",
        recipient: osmosisAddress,
        account,
      })
    ).rejects.toThrow("selected account changed");
    expect(account.cosmos.makeIBCTransferTx).not.toHaveBeenCalled();
  });

  it("rejects an aborted preparation even if a fetch adapter resolves late", async () => {
    const controller = new AbortController();
    const makeIBCTransferTx = jest.fn();
    mockFetch((_, response) => {
      controller.abort();
      return response;
    });
    await expect(
      prepareEpixBridgeTx({
        direction: "deposit",
        amount: "1",
        recipient: osmosisAddress,
        account: { bech32Address: epixAddress, cosmos: { makeIBCTransferTx } },
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(makeIBCTransferTx).not.toHaveBeenCalled();
  });

  it("never substitutes a re-encoded Ethermint address for the Osmosis account", async () => {
    const fetch = mockFetch();
    const makeIBCTransferTx = jest.fn();
    await expect(
      prepareEpixBridgeTx({
        direction: "deposit",
        amount: "1",
        recipient: epixAddress,
        account: { bech32Address: epixAddress, cosmos: { makeIBCTransferTx } },
      })
    ).rejects.toThrow("Unmatched prefix");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the existing wallet builder to encode an exact deposit and fresh height timeout", async () => {
    mockFetch();
    const base = {
      bech32Address: epixAddress,
      isNanoLedger: false,
      registerMakeSendTokenFn: jest.fn(),
    };
    const chainGetter = {
      getModularChain: () => ({
        unwrapped: {
          type: "ethermint",
          cosmos: { features: ["eth-key-sign"] },
        },
      }),
    };
    const queriesStore = {
      get: () => ({
        cosmos: {
          queryRPCStatus: {
            waitFreshResponse: jest.fn().mockResolvedValue(undefined),
            network: "osmosis-1",
            latestBlockHeight: new Int("71700000"),
          },
        },
      }),
    };
    const cosmos = new CosmosAccountImpl(
      base as unknown as ConstructorParameters<typeof CosmosAccountImpl>[0],
      chainGetter as unknown as ConstructorParameters<
        typeof CosmosAccountImpl
      >[1],
      "epix_1916-1",
      queriesStore as unknown as ConstructorParameters<
        typeof CosmosAccountImpl
      >[3],
      defaultCosmosMsgOpts,
      {}
    );
    const tx = await prepareEpixBridgeTx({
      direction: "deposit",
      amount: "1.000000000000000001",
      recipient: osmosisAddress,
      account: { bech32Address: epixAddress, cosmos },
    });
    const { protoMsgs } = await tx.msgs();
    const msg = MsgTransfer.decode(protoMsgs[0].value);
    expect(msg).toMatchObject({
      sourcePort: "transfer",
      sourceChannel: "channel-0",
      token: {
        denom: EPIX_CURRENCY.coinMinimalDenom,
        amount: "1000000000000000001",
      },
      sender: epixAddress,
      receiver: osmosisAddress,
      timeoutHeight: { revisionNumber: "1", revisionHeight: "71700150" },
    });
  });
});
