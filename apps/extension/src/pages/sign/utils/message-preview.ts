import { Buffer } from "buffer/";
import type { StdSignDoc } from "@keplr-wallet/types";

function decodeMessageText(bytes: Uint8Array): string | undefined {
  try {
    // Keep the original bytes available when controls would be invisible or
    // reorder the text. Tabs and line breaks remain readable in the preview.
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    if (/[\p{Bidi_Control}\p{Cc}\uFEFF]/u.test(text.replace(/[\t\n\r]/g, ""))) {
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  }
}

export function getADR36MessagePreview(signDoc: StdSignDoc, isText: boolean) {
  const [msg] = signDoc.msgs;
  if (signDoc.msgs.length !== 1 || msg.type !== "sign/MsgSignData") {
    throw new Error("Sign doc is improper ADR-36");
  }
  const encoded: string = msg.value.data;
  const message = isText
    ? decodeMessageText(Buffer.from(encoded, "base64")) ?? encoded
    : encoded;
  return { message, rawMessage: JSON.stringify(signDoc, null, 2) };
}

export function getEthereumMessagePreview(bytes: Uint8Array) {
  const hex = "0x" + Buffer.from(bytes).toString("hex");
  // Ethereum signers frequently receive a 32-byte digest. Keep its full hex
  // representation, even if the bytes happen to form printable characters.
  const text = bytes.length === 32 ? undefined : decodeMessageText(bytes);
  return text ? { message: text, rawMessage: hex } : { message: hex };
}
