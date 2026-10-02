import { Buffer } from "buffer/";
import { readIBCWriteAcknowledgement } from "./ibc-acknowledgement";
import { RecentSendHistoryService } from "./service";
import { IbcHop } from "./types";
import fixture from "./fixtures/epix-return-receipt.json";

const packet = ["transfer", "channel-108456", "308"] as const;
const success = '{"result":"AQ=="}';
const error = '{"error":"transfer rejected"}';
const identity = [
  { key: "packet_src_port", value: packet[0] },
  { key: "packet_src_channel", value: packet[1] },
  { key: "packet_sequence", value: packet[2] },
];
function withPayload(attributes: { key: string; value: string }[]) {
  return {
    events: [
      {
        type: "write_acknowledgement",
        attributes: [...identity, ...attributes],
      },
    ],
  };
}
function payload(value: string, key = "packet_ack_hex") {
  return withPayload([
    {
      key,
      value:
        key === "packet_ack_hex" ? Buffer.from(value).toString("hex") : value,
    },
  ]);
}

it("reads the actual successful Epix hex acknowledgement for packet308", () => {
  expect(
    Buffer.from(
      readIBCWriteAcknowledgement(fixture, ...packet) ?? new Uint8Array()
    ).toString()
  ).toBe(success);
});

it.each([success, error])(
  "supports hex, legacy raw and base64 acknowledgement attributes (%#)",
  (value) => {
    for (const key of ["packet_ack", "packet_ack_hex"]) {
      const tx = payload(value, key);
      expect(
        Buffer.from(
          readIBCWriteAcknowledgement(tx, ...packet) ?? new Uint8Array()
        ).toString()
      ).toBe(value);
      tx.events[0].attributes = tx.events[0].attributes.map((attribute) => ({
        key: Buffer.from(attribute.key).toString("base64"),
        value: Buffer.from(attribute.value).toString("base64"),
      }));
      expect(
        Buffer.from(
          readIBCWriteAcknowledgement(tx, ...packet) ?? new Uint8Array()
        ).toString()
      ).toBe(value);
    }
  }
);

it("accepts matching raw and hex payloads and rejects conflicting payloads", () => {
  const raw = { key: "packet_ack", value: success };
  const hex = {
    key: "packet_ack_hex",
    value: Buffer.from(success).toString("hex"),
  };
  expect(
    Buffer.from(
      readIBCWriteAcknowledgement(withPayload([raw, hex]), ...packet) ??
        new Uint8Array()
    ).toString()
  ).toBe(success);
  expect(() =>
    readIBCWriteAcknowledgement(
      withPayload([{ ...raw, value: error }, hex]),
      ...packet
    )
  ).toThrow("Conflicting");
});

it.each(["", "0", "zz", "0x7b", "ff", "00".repeat(4097)])(
  "rejects malformed or excessive hex (%#)",
  (value) => {
    expect(() =>
      readIBCWriteAcknowledgement(
        withPayload([{ key: "packet_ack_hex", value }]),
        ...packet
      )
    ).toThrow();
  }
);

it.each([
  "null",
  "[]",
  "{}",
  '{"error":false}',
  '{"error":""}',
  '{"result":""}',
  '{"result":"???"}',
  '{"result":"AQ==","error":"bad"}',
  " ".repeat(4097),
])(
  "does not classify malformed acknowledgement JSON as success or refund (%#)",
  (value) => {
    expect(() =>
      readIBCWriteAcknowledgement(payload(value), ...packet)
    ).toThrow();
  }
);

it("rejects duplicate normalized attributes and invalid base64 values", () => {
  const tx = payload(success);
  tx.events[0].attributes.push({
    key: Buffer.from("packet_sequence").toString("base64"),
    value: Buffer.from("308").toString("base64"),
  });
  expect(() => readIBCWriteAcknowledgement(tx, ...packet)).toThrow("Duplicate");
  expect(() =>
    readIBCWriteAcknowledgement(
      withPayload([
        {
          key: Buffer.from("packet_ack").toString("base64"),
          value: Buffer.from(success).toString("base64") + "!",
        },
      ]),
      ...packet
    )
  ).toThrow("Invalid base64");
});

it("rejects a matching acknowledgement event without payload or with repeated events", () => {
  expect(() => readIBCWriteAcknowledgement(withPayload([]), ...packet)).toThrow(
    "Missing"
  );
  const tx = payload(success);
  tx.events.push(tx.events[0]);
  expect(() => readIBCWriteAcknowledgement(tx, ...packet)).toThrow(
    "Duplicate packet"
  );
});

it("ignores malformed payloads belonging to a different packet", () => {
  const other = withPayload([{ key: "packet_ack_hex", value: "invalid" }]);
  other.events[0].attributes = other.events[0].attributes.map((item) =>
    item.key === "packet_sequence" ? { ...item, value: "309" } : item
  );
  const tx = { events: [...other.events, ...payload(success).events] };
  expect(
    Buffer.from(
      readIBCWriteAcknowledgement(tx, ...packet) ?? new Uint8Array()
    ).toString()
  ).toBe(success);
});

it.each([0, 1, 2])(
  "does not use an acknowledgement for another packet field (%#)",
  (index) => {
    const expected = [...packet];
    expected[index] = "different" as (typeof expected)[number];
    expect(
      readIBCWriteAcknowledgement(
        fixture,
        expected[0],
        expected[1],
        expected[2]
      )
    ).toBeUndefined();
  }
);

function trackReceipt(tx: unknown) {
  const hop: IbcHop = {
    portId: packet[0],
    channelId: packet[1],
    sequence: packet[2],
    counterpartyChainId: "epix_1916-1",
    completed: false,
  };
  // The receive tracer provisionally marks the hop completed before invoking
  // its callback. Exercise the real flow's correction and completion guards.
  const receive = jest.fn<
    undefined,
    [
      {
        onHopCompleted: (amount: undefined, tx: unknown) => void;
        onAllCompleted: () => void;
      }
    ]
  >();
  const callbacks = {
    onHopCompleted: jest.fn(),
    onAllCompleted: jest.fn(),
    onContinue: jest.fn(),
    onRetry: jest.fn(),
    onFulfill: jest.fn(),
    onClose: jest.fn(),
    onError: jest.fn(),
  };
  const receiver = {
    chainsService: { getModularChainInfo: () => undefined },
    trackIBCHopRecvPacket: receive,
    getIBCWriteAcknowledgementAckFromTx: readIBCWriteAcknowledgement,
    getIBCRecvPacketIndexFromTx: () => 0,
  };
  const args = { ...callbacks, ibcHistory: [hop], sourceChainId: "osmosis-1" };
  const track = Reflect.get(
    RecentSendHistoryService.prototype,
    "trackIbcHopFlowWithTimeout"
  ) as (params: typeof args) => void;
  track.call(receiver, args);
  const captured = receive.mock.calls[0][0];
  hop.completed = true;
  captured.onHopCompleted(undefined, tx);
  captured.onAllCompleted();
  return { hop, ...callbacks };
}

it("completes the real hex-success receipt without marking refund", () => {
  const tracked = trackReceipt(fixture);
  expect(tracked.hop.completed).toBe(true);
  expect(tracked.hop.error).toBeUndefined();
  expect(tracked.onAllCompleted).toHaveBeenCalledTimes(1);
  expect(tracked.onHopCompleted).toHaveBeenCalledTimes(1);
  expect(tracked.onError).not.toHaveBeenCalled();
});

it("marks refund only for a decoded matching error acknowledgement", () => {
  const tracked = trackReceipt(payload(error));
  expect(tracked.hop.error).toBe("Packet processing failed");
  expect(tracked.onRetry).toHaveBeenCalledTimes(1);
  expect(tracked.onAllCompleted).not.toHaveBeenCalled();
});

it.each([
  withPayload([{ key: "packet_ack_hex", value: "0" }]),
  withPayload([
    { key: "packet_ack", value: error },
    { key: "packet_ack_hex", value: Buffer.from(success).toString("hex") },
  ]),
])(
  "retries an unknown acknowledgement without success or refund (%#)",
  (tx) => {
    const tracked = trackReceipt(tx);
    expect(tracked.hop.completed).toBe(false);
    expect(tracked.hop.error).toBeUndefined();
    expect(tracked.onError).toHaveBeenCalledTimes(1);
    expect(tracked.onAllCompleted).not.toHaveBeenCalled();
    expect(tracked.onHopCompleted).not.toHaveBeenCalled();
    expect(tracked.onRetry).not.toHaveBeenCalled();
  }
);
