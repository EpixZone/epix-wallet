import { Buffer } from "buffer/";

const maxPacketBytes = 4096;

export function packetAttributes(
  attributes: { key: string; value: string }[]
): Record<string, string> {
  const entries = new Map<string, string>();
  for (const { key, value } of attributes) {
    if (entries.has(key)) throw new TypeError("Duplicate packet attribute");
    entries.set(key, value);
  }
  return Object.fromEntries(entries);
}

function decodePacketHex(hex: string): string {
  if (
    hex.length === 0 ||
    hex.length > maxPacketBytes * 2 ||
    hex.length % 2 !== 0 ||
    !/^[\da-fA-F]+$/.test(hex)
  )
    throw new TypeError("Invalid hex packet data");
  const bytes = Buffer.from(hex, "hex");
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes))
    throw new TypeError("Invalid packet data encoding");
  return text;
}

/** Raw and hex attributes describe the same packet bytes when both exist. */
export function parsePacketData(
  attributes: Record<string, string>
): Record<string, unknown> {
  const raw = attributes["packet_data"];
  const hex = attributes["packet_data_hex"];
  const decoded = hex === undefined ? undefined : decodePacketHex(hex);
  if (raw !== undefined && decoded !== undefined && raw !== decoded)
    throw new TypeError("Conflicting packet data attributes");
  const text = raw ?? decoded;
  if (
    text === undefined ||
    text.length > maxPacketBytes ||
    Buffer.byteLength(text, "utf8") > maxPacketBytes
  )
    throw new TypeError("Invalid packet data length");
  const data: unknown = JSON.parse(text);
  if (data === null || typeof data !== "object" || Array.isArray(data))
    throw new TypeError("Invalid packet data object");
  return data as Record<string, unknown>;
}
