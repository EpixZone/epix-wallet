import { Bech32Address } from "@keplr-wallet/cosmos";
import { CosmosAccountImpl, MakeTxResponse } from "@keplr-wallet/stores";
import { AppCurrency } from "@keplr-wallet/types";
import { Buffer } from "buffer/";

export const EPIX_CHAIN_ID = "epix_1916-1";
export const OSMOSIS_CHAIN_ID = "osmosis-1";
export const EPIX_CURRENCY: AppCurrency = {
  coinDenom: "EPIX",
  coinMinimalDenom: "aepix",
  coinDecimals: 18,
  coinGeckoId: "epix",
};
export const OSMOSIS_EPIX_CURRENCY: AppCurrency = {
  ...EPIX_CURRENCY,
  coinMinimalDenom:
    "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF",
};

export type EpixBridgeDirection = "deposit" | "withdraw";
export type EpixBridgeEndpoints = { epix: string; osmosis: string };
export const EPIX_BRIDGE_ENDPOINTS: EpixBridgeEndpoints = {
  epix: "https://api.epix.zone",
  osmosis: "https://lcd.osmosis.zone",
};

const channels = {
  epix: "channel-0",
  osmosis: "channel-108456",
} as const;
const maxAmount =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

/** Convert user input without floating point or silent fractional truncation. */
export function parseAmountToMinimal(amount: string, decimals: number): string {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    amount.length > 100 ||
    !/^\d+(?:\.\d+)?$/.test(amount)
  ) {
    throw new TypeError("Enter a valid decimal amount.");
  }
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new RangeError(`This asset supports at most ${decimals} decimals.`);
  }
  const minimal = (whole + fraction.padEnd(decimals, "0")).replace(/^0+/, "");
  if (!minimal) throw new RangeError("Enter an amount greater than zero.");
  if (
    minimal.length > maxAmount.length ||
    (minimal.length === maxAmount.length && minimal > maxAmount)
  ) {
    throw new RangeError("The amount is too large.");
  }
  return minimal;
}

type ChannelResponse = {
  channel?: {
    state?: string;
    ordering?: string;
    version?: string;
    counterparty?: { port_id?: string; channel_id?: string };
  };
};
type ClientResponse = {
  identified_client_state?: {
    client_id?: string;
    client_state?: { chain_id?: string };
  };
};

class BridgeHTTPError extends Error {
  constructor(readonly status: number) {
    super(`Unable to verify the IBC route (HTTP ${status}).`);
  }
}

async function fetchBridgeJSON<T>(
  endpoint: string,
  path: string,
  signal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new BridgeHTTPError(response.status);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function validateChannel(
  endpoint: string,
  channelId: string,
  counterpartyChannel: string,
  counterpartyChain: string,
  signal?: AbortSignal
): Promise<void> {
  const path = `/ibc/core/channel/v1/channels/${channelId}/ports/transfer`;
  const [response, clientResponse] = await Promise.all([
    fetchBridgeJSON<ChannelResponse>(endpoint, path, signal),
    fetchBridgeJSON<ClientResponse>(endpoint, `${path}/client_state`, signal),
  ]);
  const channel = response.channel;
  if (
    channel?.state !== "STATE_OPEN" ||
    channel.ordering !== "ORDER_UNORDERED" ||
    channel.version !== "ics20-1" ||
    channel.counterparty?.port_id !== "transfer" ||
    channel.counterparty.channel_id !== counterpartyChannel
  ) {
    throw new Error("The expected Epix–Osmosis IBC channel is not open.");
  }
  const client = clientResponse.identified_client_state;
  if (
    client?.client_state?.chain_id !== counterpartyChain ||
    !client.client_id ||
    !/^07-tendermint-\d+$/.test(client.client_id)
  ) {
    throw new Error("The IBC channel does not connect to the expected chain.");
  }
  const status = await fetchBridgeJSON<{ status?: string }>(
    endpoint,
    `/ibc/core/client/v1/client_status/${client.client_id}`,
    signal
  );
  if (status.status !== "Active") {
    throw new Error("The IBC client is not active. Try again later.");
  }
}

export async function validateEpixBridgeRoute(
  direction: EpixBridgeDirection,
  signal?: AbortSignal,
  endpoints: EpixBridgeEndpoints = EPIX_BRIDGE_ENDPOINTS
): Promise<void> {
  // Both directions use the same verified, direct ICS-20 channel pair.
  if (direction !== "deposit" && direction !== "withdraw") {
    throw new TypeError("Invalid bridge direction.");
  }
  await Promise.all([
    validateChannel(
      endpoints.epix,
      channels.epix,
      channels.osmosis,
      OSMOSIS_CHAIN_ID,
      signal
    ),
    validateChannel(
      endpoints.osmosis,
      channels.osmosis,
      channels.epix,
      EPIX_CHAIN_ID,
      signal
    ),
  ]);
}

function validateAccount(address: string, prefix: string): void {
  if (Bech32Address.fromBech32(address, prefix).address.length !== 20) {
    throw new TypeError("Invalid bridge account address.");
  }
}

type PacketEvent = {
  type: string;
  attributes: readonly { key: string; value: string }[];
};
const packetAttributeNames = new Set([
  "packet_src_port",
  "packet_src_channel",
  "packet_dst_port",
  "packet_dst_channel",
  "packet_sequence",
]);

function packetAttributes(event: PacketEvent): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const attribute of event.attributes) {
    if (packetAttributeNames.has(attribute.key)) {
      attributes.set(attribute.key, attribute.value);
    } else if (attribute.key.length <= 64 && attribute.value.length <= 128) {
      // Older CometBFT responses encode both event keys and values in base64.
      const key = Buffer.from(attribute.key, "base64").toString();
      if (packetAttributeNames.has(key)) {
        attributes.set(key, Buffer.from(attribute.value, "base64").toString());
      }
    }
  }
  return attributes;
}

function validPacketSequence(sequence: string): boolean {
  return (
    /^[1-9]\d{0,19}$/.test(sequence) &&
    (sequence.length < 20 || sequence <= "18446744073709551615")
  );
}

/** Only accept a single packet emitted on this exact direct bridge route. */
export function getEpixBridgePacketSequence(
  direction: EpixBridgeDirection,
  events: readonly PacketEvent[]
): string | undefined {
  const source = direction === "deposit" ? channels.epix : channels.osmosis;
  const destination =
    direction === "deposit" ? channels.osmosis : channels.epix;
  const sequences: string[] = [];
  for (const event of events.filter((event) => event.type === "send_packet")) {
    const attributes = packetAttributes(event);
    const sequence = attributes.get("packet_sequence") ?? "";
    if (
      attributes.get("packet_src_port") === "transfer" &&
      attributes.get("packet_dst_port") === "transfer" &&
      attributes.get("packet_src_channel") === source &&
      attributes.get("packet_dst_channel") === destination &&
      validPacketSequence(sequence)
    ) {
      sequences.push(sequence);
    }
  }
  return sequences.length === 1 ? sequences[0] : undefined;
}

/**
 * A source-chain success alone does not confirm IBC delivery. The destination
 * stores SHA-256 of the ICS-20 success acknowledgement: {"result":"AQ=="}.
 * Any other commitment remains unconfirmed rather than claiming success.
 */
export async function getEpixBridgePacketStatus(
  direction: EpixBridgeDirection,
  sequence: string,
  signal?: AbortSignal,
  endpoints: EpixBridgeEndpoints = EPIX_BRIDGE_ENDPOINTS
): Promise<"pending" | "received" | "unknown"> {
  if (!validPacketSequence(sequence))
    throw new TypeError("Invalid packet sequence.");
  const destination = direction === "deposit" ? "osmosis" : "epix";
  try {
    const response = await fetchBridgeJSON<{ acknowledgement?: string }>(
      endpoints[destination],
      `/ibc/core/channel/v1/channels/${channels[destination]}/ports/transfer/packet_acks/${sequence}`,
      signal
    );
    return response.acknowledgement ===
      "CPdVftUYJv4Y2EUSvyTsdQAe268hI6R333KgqfNkCnw="
      ? "received"
      : "unknown";
  } catch (error) {
    if (error instanceof BridgeHTTPError && error.status === 404)
      return "pending";
    throw error;
  }
}

/** Prepare the existing wallet transaction; callers explicitly review and send. */
export async function prepareEpixBridgeTx({
  direction,
  amount,
  account,
  recipient,
  signal,
  endpoints,
}: {
  direction: EpixBridgeDirection;
  amount: string;
  account: {
    readonly bech32Address: string;
    readonly cosmos: Pick<CosmosAccountImpl, "makeIBCTransferTx">;
  };
  recipient: string;
  signal?: AbortSignal;
  endpoints?: EpixBridgeEndpoints;
}): Promise<MakeTxResponse> {
  const deposit = direction === "deposit";
  const sender = account.bech32Address;
  validateAccount(sender, deposit ? "epix" : "osmo");
  validateAccount(recipient, deposit ? "osmo" : "epix");
  parseAmountToMinimal(amount, 18);
  await validateEpixBridgeRoute(direction, signal, endpoints);
  if (signal?.aborted || account.bech32Address !== sender) {
    throw new Error(
      "The selected account changed. Prepare the transfer again."
    );
  }
  return account.cosmos.makeIBCTransferTx(
    {
      portId: "transfer",
      channelId: deposit ? channels.epix : channels.osmosis,
      counterpartyChainId: deposit ? OSMOSIS_CHAIN_ID : EPIX_CHAIN_ID,
    },
    amount,
    deposit ? EPIX_CURRENCY : OSMOSIS_EPIX_CURRENCY,
    recipient
  );
}
