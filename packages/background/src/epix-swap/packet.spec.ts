import { Buffer } from "buffer/";
import fixture from "./fixtures/epix-bridge.json";
import { lookupTx, PacketEvent } from "./network";
import { matchingPacketSequence } from "./plan";
import { EpixSwapOperation } from "./types";

// Public committed Epix transaction A864FFE4...35BAD9D7, height 5870372.
// Keep the node's hex-only packet representation, rather than normalizing it.
const event = fixture.tx_response.events[0];
function fixtureAttribute(key: string) {
  const attribute = event.attributes.find((a) => a.key === key);
  if (!attribute) throw new TypeError("Missing fixture attribute");
  return attribute;
}
const hex = fixtureAttribute("packet_data_hex").value;
const raw = Buffer.from(hex, "hex").toString("utf8");
const data = JSON.parse(raw);
const operation = {
  direction: "to-osmosis",
  sourceAddress: data.sender,
  destinationAddress: data.receiver,
  amountIn: data.amount,
  packetTimeoutTimestamp: "1790954282720000000",
} as EpixSwapOperation;

function withData(attributes: PacketEvent["attributes"]): PacketEvent {
  return {
    ...event,
    attributes: [
      ...event.attributes.filter((a) => a.key !== "packet_data_hex"),
      ...attributes,
    ],
  };
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

function serve(attributes: PacketEvent["attributes"]) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        tx_response: {
          ...fixture.tx_response,
          events: [{ ...event, attributes }],
        },
      }),
  })) as jest.Mock;
}

it.each(["plain", "base64"])(
  "matches the actual hex-only Epix receipt through %s event attributes",
  async (encoding) => {
    const attributes = event.attributes.map(({ key, value }) =>
      encoding === "base64"
        ? {
            key: Buffer.from(key).toString("base64"),
            value: Buffer.from(value).toString("base64"),
          }
        : { key, value }
    );
    serve(attributes);
    const tx = await lookupTx(
      "https://epix.example",
      fixture.tx_response.txhash
    );
    expect(tx?.code).toBe(0);
    expect(matchingPacketSequence(tx?.events ?? [], operation)).toBe("881");
  }
);

it("keeps raw packet data and identical raw/hex pairs compatible", () => {
  const rawAttribute = { key: "packet_data", value: raw };
  expect(matchingPacketSequence([withData([rawAttribute])], operation)).toBe(
    "881"
  );
  expect(
    matchingPacketSequence(
      [
        withData([
          rawAttribute,
          { key: "packet_data_hex", value: hex.toUpperCase() },
        ]),
      ],
      operation
    )
  ).toBe("881");
});

it("matches reverse hex packets only with the full return trace and proved output", () => {
  const reverse = {
    ...operation,
    direction: "to-epix" as const,
    sourceAddress: operation.destinationAddress,
    destinationAddress: operation.sourceAddress,
    swapConfirmed: true,
    swapAmountOut: "1234",
  };
  const packet = JSON.stringify({
    sender: reverse.sourceAddress,
    receiver: reverse.destinationAddress,
    amount: reverse.swapAmountOut,
    denom: "transfer/channel-108456/aepix",
  });
  const attributes = withData([
    { key: "packet_data_hex", value: Buffer.from(packet).toString("hex") },
  ]).attributes.map((attribute) => {
    if (attribute.key === "packet_src_channel")
      return { key: attribute.key, value: "channel-108456" };
    if (attribute.key === "packet_dst_channel")
      return { key: attribute.key, value: "channel-0" };
    return attribute;
  });
  expect(matchingPacketSequence([{ ...event, attributes }], reverse)).toBe(
    "881"
  );
  expect(() =>
    matchingPacketSequence([{ ...event, attributes }], {
      ...reverse,
      swapAmountOut: "1235",
    })
  ).toThrow("approved deposit packet");
});

it("rejects missing packet data", () => {
  expect(() => matchingPacketSequence([withData([])], operation)).toThrow(
    "Invalid packet data length"
  );
});

it.each(["", "0", hex + "0", "0x" + hex, hex + "gg", "00".repeat(4097), "ff"])(
  "rejects invalid, excessive or non-UTF8 hex packet data (%#)",
  (value) => {
    expect(() =>
      matchingPacketSequence(
        [withData([{ key: "packet_data_hex", value }])],
        operation
      )
    ).toThrow();
  }
);

it.each(["null", "[]", '"text"', "{} ".repeat(1100)])(
  "rejects invalid packet objects or excessive raw data (%#)",
  (value) => {
    expect(() =>
      matchingPacketSequence(
        [withData([{ key: "packet_data", value }])],
        operation
      )
    ).toThrow();
  }
);

it("rejects conflicting raw and hex data", () => {
  expect(() =>
    matchingPacketSequence(
      [
        withData([
          {
            key: "packet_data",
            value: JSON.stringify({ ...data, amount: "1" }),
          },
          { key: "packet_data_hex", value: hex },
        ]),
      ],
      operation
    )
  ).toThrow("Conflicting packet data");
});

it.each(["packet_data_hex", "packet_sequence", "packet_src_channel"])(
  "rejects duplicate %s attributes even if their values agree",
  (key) => {
    const duplicate = fixtureAttribute(key);
    expect(() =>
      matchingPacketSequence(
        [{ ...event, attributes: [...event.attributes, duplicate] }],
        operation
      )
    ).toThrow("Duplicate packet attribute");
  }
);

it("rejects duplicate raw packet data", () => {
  const attribute = { key: "packet_data", value: raw };
  expect(() =>
    matchingPacketSequence([withData([attribute, attribute])], operation)
  ).toThrow("Duplicate packet attribute");
});

it.each(["sender", "receiver", "denom", "amount"])(
  "still requires the exact approved packet %s",
  (field) => {
    const value = Buffer.from(
      JSON.stringify({ ...data, [field]: "different" })
    ).toString("hex");
    expect(() =>
      matchingPacketSequence(
        [withData([{ key: "packet_data_hex", value }])],
        operation
      )
    ).toThrow("approved deposit packet");
  }
);

it.each([
  "packet_src_port",
  "packet_src_channel",
  "packet_dst_port",
  "packet_dst_channel",
  "packet_timeout_timestamp",
  "packet_sequence",
])("still rejects a changed %s", (key) => {
  const attributes = event.attributes.map((attribute) =>
    attribute.key === key ? { key, value: "different" } : attribute
  );
  expect(() =>
    matchingPacketSequence([{ ...event, attributes }], operation)
  ).toThrow("approved deposit packet");
});

it("rejects duplicates revealed by base64 attribute normalization", async () => {
  serve([
    ...event.attributes,
    {
      key: Buffer.from("packet_sequence").toString("base64"),
      value: Buffer.from("882").toString("base64"),
    },
  ]);
  const tx = await lookupTx("https://epix.example", fixture.tx_response.txhash);
  expect(() => matchingPacketSequence(tx?.events ?? [], operation)).toThrow(
    "Duplicate packet attribute"
  );
});

it.each(["!", "==="])(
  "rejects malformed base64 packet values (%#)",
  async (suffix) => {
    serve([
      {
        key: Buffer.from("packet_data_hex").toString("base64"),
        value: Buffer.from(hex).toString("base64") + suffix,
      },
    ]);
    await expect(
      lookupTx("https://epix.example", fixture.tx_response.txhash)
    ).rejects.toThrow("Invalid encoded packet attribute");
  }
);
