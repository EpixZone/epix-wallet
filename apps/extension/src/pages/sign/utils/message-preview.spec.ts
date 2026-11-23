import type { StdSignDoc } from "@keplr-wallet/types";
import {
  getADR36MessagePreview,
  getEthereumMessagePreview,
} from "./message-preview";

function adr36(bytes: Uint8Array): StdSignDoc {
  return {
    chain_id: "",
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "0" },
    memo: "",
    msgs: [
      {
        type: "sign/MsgSignData",
        value: { data: Buffer.from(bytes).toString("base64") },
      },
    ],
  };
}

it.each([
  "Review this test message\n  with two spaces.",
  '{"count": 9007199254740993, "label": "one", "label": "two"}',
])("shows the signed ADR-36 text verbatim: %s", (message) => {
  const signDoc = adr36(Buffer.from(message));
  expect(getADR36MessagePreview(signDoc, true)).toEqual({
    message,
    rawMessage: JSON.stringify(signDoc, null, 2),
  });
});

it("keeps an ADR-36 byte request in its original base64 representation", () => {
  const signDoc = adr36(Buffer.from("test bytes"));
  expect(getADR36MessagePreview(signDoc, false).message).toBe(
    "dGVzdCBieXRlcw=="
  );
});

it.each([
  Buffer.from([0xff]),
  Buffer.from("left\u202eright"),
  Buffer.from("\ufefftext"),
  Buffer.from([0]),
])("renders non-displayable signed bytes losslessly", (bytes) => {
  expect(getEthereumMessagePreview(bytes).message).toBe(
    "0x" + bytes.toString("hex")
  );
  expect(getADR36MessagePreview(adr36(bytes), true).message).toBe(
    bytes.toString("base64")
  );
});

it.each(["0x74657374", "0xnote", "test\n  Ω"])(
  "shows readable Ethereum message bytes without another decoding step: %s",
  (text) => {
    const bytes = Buffer.from(text);
    expect(getEthereumMessagePreview(bytes)).toEqual({
      message: text,
      rawMessage: "0x" + bytes.toString("hex"),
    });
  }
);

it("shows 32-byte Ethereum digests and empty byte sequences in hex", () => {
  const digest = Buffer.alloc(32, 0x41);
  expect(getEthereumMessagePreview(digest)).toEqual({
    message: "0x" + "41".repeat(32),
  });
  expect(getEthereumMessagePreview(new Uint8Array())).toEqual({
    message: "0x",
  });
});
