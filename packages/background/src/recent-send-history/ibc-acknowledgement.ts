import { Buffer } from "buffer/";

const maxAcknowledgementBytes = 4096;
const identityKeys = new Set([
  "packet_src_port",
  "packet_src_channel",
  "packet_sequence",
]);
const keys = new Set([...identityKeys, "packet_ack", "packet_ack_hex"]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function utf8(bytes: Buffer): string {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes))
    throw new TypeError("Invalid acknowledgement encoding");
  return text;
}

function base64(value: string): Buffer {
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value)
    throw new TypeError("Invalid base64 acknowledgement attribute");
  return bytes;
}

function attribute(
  key: string,
  value: string,
  allowedKeys: ReadonlySet<string>
) {
  if (allowedKeys.has(key)) return { key, value };
  const decodedKey = Buffer.from(key, "base64").toString("utf8");
  if (
    !allowedKeys.has(decodedKey) ||
    Buffer.from(decodedKey).toString("base64") !== key
  )
    return undefined;
  if (value.length > maxAcknowledgementBytes * 4)
    throw new TypeError("Acknowledgement attribute is too long");
  return { key: decodedKey, value: utf8(base64(value)) };
}

function attributes(
  value: unknown,
  allowedKeys: ReadonlySet<string>
): Map<string, string> {
  if (!Array.isArray(value) || value.length > 128)
    throw new TypeError("Invalid acknowledgement attributes");
  const result = new Map<string, string>();
  for (const item of value) {
    if (
      !record(item) ||
      typeof item["key"] !== "string" ||
      typeof item["value"] !== "string"
    )
      throw new TypeError("Invalid acknowledgement attribute");
    const decoded = attribute(item["key"], item["value"], allowedKeys);
    if (!decoded) continue;
    if (result.has(decoded.key))
      throw new TypeError("Duplicate acknowledgement attribute");
    result.set(decoded.key, decoded.value);
  }
  return result;
}

function hex(value: string): Buffer {
  if (
    value.length === 0 ||
    value.length > maxAcknowledgementBytes * 2 ||
    value.length % 2 !== 0 ||
    !/^[\da-fA-F]+$/.test(value)
  )
    throw new TypeError("Invalid hex acknowledgement");
  return Buffer.from(value, "hex");
}

function acknowledgementBytes(values: Map<string, string>): Buffer {
  const raw = values.get("packet_ack");
  const encoded = values.get("packet_ack_hex");
  if (raw !== undefined && raw.length > maxAcknowledgementBytes)
    throw new TypeError("Acknowledgement is too long");
  const plain = raw === undefined ? undefined : Buffer.from(raw, "utf8");
  const decoded = encoded === undefined ? undefined : hex(encoded);
  if (plain && decoded && !plain.equals(decoded))
    throw new TypeError("Conflicting acknowledgement attributes");
  const bytes = plain ?? decoded;
  if (!bytes || bytes.length === 0 || bytes.length > maxAcknowledgementBytes)
    throw new TypeError("Missing or excessive acknowledgement");
  return bytes;
}

function validateAcknowledgement(bytes: Buffer): void {
  const value: unknown = JSON.parse(utf8(bytes));
  if (!record(value)) throw new TypeError("Invalid acknowledgement object");
  if ("error" in value) {
    if (
      typeof value["error"] !== "string" ||
      !value["error"] ||
      "result" in value
    )
      throw new TypeError("Invalid error acknowledgement");
    return;
  }
  if (
    typeof value["result"] !== "string" ||
    base64(value["result"]).length === 0
  )
    throw new TypeError("Invalid result acknowledgement");
}

/** Match the exact packet before interpreting its legacy or hex acknowledgement. */
export function readIBCWriteAcknowledgement(
  tx: unknown,
  sourcePortId: string,
  sourceChannelId: string,
  sequence: string
): Uint8Array | undefined {
  if (!record(tx) || !Array.isArray(tx["events"]))
    throw new TypeError("Invalid transaction events");
  let result: Buffer | undefined;
  for (const event of tx["events"]) {
    if (!record(event) || event["type"] !== "write_acknowledgement") continue;
    const identity = attributes(event["attributes"], identityKeys);
    if (
      identity.get("packet_src_port") !== sourcePortId ||
      identity.get("packet_src_channel") !== sourceChannelId ||
      identity.get("packet_sequence") !== sequence
    )
      continue;
    if (result) throw new TypeError("Duplicate packet acknowledgement");
    result = acknowledgementBytes(attributes(event["attributes"], keys));
    validateAcknowledgement(result);
  }
  return result;
}
