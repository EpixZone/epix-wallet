import { Dec } from "@keplr-wallet/unit";
import { StdFee } from "@keplr-wallet/types";
import { Buffer } from "buffer/";
import { TxMsgData } from "@keplr-wallet/proto-types/cosmos/base/abci/v1beta1/abci";
import { MsgSwapExactAmountInResponse } from "@keplr-wallet/proto-types/osmosis/poolmanager/v1beta1/tx";
import type { EpixSwapDirection } from "./types";
import {
  EPIX_CHAIN_ID,
  OSMOSIS_CHAIN_ID,
  SUPPORTED_OUTPUT_DENOMS,
} from "./constants";

export { SUPPORTED_OUTPUT_DENOMS } from "./constants";

export const EPIX_OSMOSIS_DENOM =
  "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF";
const uint256Max = (BigInt(1) << BigInt(256)) - BigInt(1);
const uint64Max = (BigInt(1) << BigInt(64)) - BigInt(1);

const feeLifetimeMs = 30_000;
const networkUnavailable = "Network data unavailable. Please try again.";

export class SwapHTTPError extends Error {
  constructor(readonly status: number) {
    super(`Network request failed (HTTP ${status}).`);
  }
}

/** Bounded public reads. Caller aborts never leave a fetch running indefinitely. */
export async function fetchJSON<T>(
  endpoint: string,
  path: string,
  signal?: AbortSignal,
  request?: { method: "POST"; body: string }
): Promise<T> {
  if (signal?.aborted) throw new Error("Request cancelled");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 10_000);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, {
      signal: controller.signal,
      cache: "no-store",
      ...request,
      headers: request ? { "content-type": "application/json" } : undefined,
    });
    if (!response.ok) throw new SwapHTTPError(response.status);
    const text = await response.text();
    if (controller.signal.aborted) throw new Error("Request cancelled");
    if (text.length > 2_000_000) throw new Error(networkUnavailable);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function decimal(value: unknown, allowZero = false): Dec {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    value.trim() !== value ||
    !/^\d+(?:\.\d{1,18})?$/.test(value)
  )
    throw new Error(networkUnavailable);
  const amount = new Dec(value);
  if (amount.lt(new Dec(0)) || (!allowZero && amount.isZero()))
    throw new Error(networkUnavailable);
  return amount;
}

/** gasLimit is an approved spending cap or a padded simulation result, not an estimate. */
export async function getOsmosisFeeQuote({
  rest,
  gasLimit,
  feeDenom,
  minimumBaseGasPrice,
  signal,
}: {
  rest: string;
  gasLimit: number;
  feeDenom: string;
  minimumBaseGasPrice: string;
  signal?: AbortSignal;
}): Promise<{ fee: StdFee; gasPrice: string; expiresAt: number }> {
  if (!Number.isSafeInteger(gasLimit) || gasLimit <= 0 || gasLimit > 50_000_000)
    throw new TypeError("Invalid gas limit");
  const expiresAt = Date.now() + feeLifetimeMs;
  const minimum = decimal(minimumBaseGasPrice, true);
  const [baseFee, baseDenom] = await Promise.all([
    fetchJSON<{ base_fee?: unknown }>(
      rest,
      "/osmosis/txfees/v1beta1/cur_eip_base_fee",
      signal
    ),
    fetchJSON<{ base_denom?: unknown }>(
      rest,
      "/osmosis/txfees/v1beta1/base_denom",
      signal
    ),
  ]);
  if (baseDenom.base_denom !== "uosmo") throw new Error(networkUnavailable);
  const buffered = decimal(baseFee.base_fee).mul(new Dec("1.2"));
  let gasPrice = buffered.gt(minimum) ? buffered : minimum;
  if (feeDenom !== "uosmo") {
    gasPrice = await convertFeePrice(rest, feeDenom, gasPrice, signal);
  }
  if (signal?.aborted || expiresAt <= Date.now())
    throw new Error("Network fee quote expired. Please try again.");
  const amount = gasPrice.mul(new Dec(gasLimit)).roundUp().toString();
  if (!/^[1-9]\d*$/.test(amount)) throw new Error(networkUnavailable);
  return {
    fee: { gas: String(gasLimit), amount: [{ denom: feeDenom, amount }] },
    gasPrice: gasPrice.toString(),
    expiresAt,
  };
}

async function convertFeePrice(
  rest: string,
  denom: string,
  baseGasPrice: Dec,
  signal?: AbortSignal
): Promise<Dec> {
  const allowed = await fetchJSON<{ fee_tokens?: { denom?: unknown }[] }>(
    rest,
    "/osmosis/txfees/v1beta1/fee_tokens",
    signal
  );
  if (
    !Array.isArray(allowed.fee_tokens) ||
    !allowed.fee_tokens.some((token) => token.denom === denom)
  )
    throw new Error("Osmosis does not currently accept this asset for fees.");
  const spot = await fetchJSON<{ spot_price?: unknown }>(
    rest,
    `/osmosis/txfees/v1beta1/spot_price_by_denom?denom=${encodeURIComponent(
      denom
    )}`,
    signal
  );
  // The live txfees quote already uses base units. Applying token decimals here
  // again would underpay or overpay the network fee.
  return baseGasPrice.quo(decimal(spot.spot_price)).mul(new Dec("1.01"));
}

export async function readBalance(
  rest: string,
  address: string,
  denom: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetchJSON<{
    balance?: { denom?: unknown; amount?: unknown } | null;
  }>(
    rest,
    `/cosmos/bank/v1beta1/balances/${encodeURIComponent(
      address
    )}/by_denom?denom=${encodeURIComponent(denom)}`,
    signal
  );
  if (response.balance === null) return "0";
  if (
    response.balance?.denom !== denom ||
    typeof response.balance.amount !== "string" ||
    response.balance.amount.length > 78 ||
    response.balance.amount.trim() !== response.balance.amount ||
    !/^\d+$/.test(response.balance.amount)
  )
    throw new Error(networkUnavailable);
  return response.balance.amount;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(
  value: unknown,
  maximum = uint256Max
): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    /^[1-9]\d{0,77}$/.test(value) &&
    BigInt(value) <= maximum
  );
}

function validDenom(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    /^[A-Za-z][A-Za-z0-9/:._-]{2,255}$/.test(value)
  );
}

export type SwapQuote = {
  amountOut: string;
  minimumAmountOut: string;
  routes: { poolId: string; tokenOutDenom: string }[];
  expiresAt: number;
};

type QuoteRequest = {
  direction: EpixSwapDirection;
  inputDenom: string;
  amountIn: string;
  outputDenom: string;
  slippageBps: number;
  signal?: AbortSignal;
};

function validSwapPair(request: QuoteRequest): boolean {
  const allowed = SUPPORTED_OUTPUT_DENOMS as readonly string[];
  if (request.direction === "to-osmosis") {
    return (
      request.inputDenom === EPIX_OSMOSIS_DENOM &&
      allowed.includes(request.outputDenom)
    );
  }
  return (
    request.direction === "to-epix" &&
    allowed.includes(request.inputDenom) &&
    request.outputDenom === EPIX_OSMOSIS_DENOM
  );
}

function assertQuoteRequest(request: QuoteRequest): void {
  if (
    !positiveInteger(request.amountIn) ||
    !validSwapPair(request) ||
    !Number.isInteger(request.slippageBps) ||
    request.slippageBps < 1 ||
    request.slippageBps > 500
  )
    throw new TypeError("Invalid swap amount or token");
}

function quoteRoute(
  data: Record<string, unknown>,
  amountIn: string,
  outputDenom: string
): SwapQuote["routes"] {
  if (!Array.isArray(data["route"]) || data["route"].length !== 1)
    throw new Error("Split swap routes are not supported");
  const route: unknown = data["route"][0];
  if (
    !record(route) ||
    route["in_amount"] !== amountIn ||
    route["out_amount"] !== data["amount_out"] ||
    !Array.isArray(route["pools"]) ||
    route["pools"].length === 0 ||
    route["pools"].length > 8
  )
    throw new Error("Invalid swap route");
  const pools = route["pools"].map((pool: unknown) => {
    if (!record(pool) || !validDenom(pool["token_out_denom"]))
      throw new Error("Invalid swap pool");
    const id =
      typeof pool["id"] === "number" && Number.isSafeInteger(pool["id"])
        ? String(pool["id"])
        : pool["id"];
    if (!positiveInteger(id, uint64Max)) throw new Error("Invalid swap pool");
    return { poolId: id, tokenOutDenom: pool["token_out_denom"] };
  });
  if (pools.at(-1)?.tokenOutDenom !== outputDenom)
    throw new Error("Quote output does not match");
  return pools;
}

export function validateSwapQuote(
  data: unknown,
  request: QuoteRequest,
  now = Date.now()
): SwapQuote {
  assertQuoteRequest(request);
  if (record(data) && data["amount_out"] === "0")
    throw new Error("Swap amount is too small");
  if (
    !record(data) ||
    !record(data["amount_in"]) ||
    data["amount_in"]["amount"] !== request.amountIn ||
    data["amount_in"]["denom"] !== request.inputDenom ||
    !positiveInteger(data["amount_out"])
  )
    throw new Error("Quote does not match this swap");
  const minimum =
    (BigInt(data["amount_out"]) * BigInt(10_000 - request.slippageBps)) /
    BigInt(10_000);
  if (minimum <= BigInt(0)) throw new Error("Swap amount is too small");
  return {
    amountOut: data["amount_out"],
    minimumAmountOut: minimum.toString(),
    routes: quoteRoute(data, request.amountIn, request.outputDenom),
    expiresAt: now + 30_000,
  };
}

export async function fetchSwapQuote(
  request: QuoteRequest
): Promise<SwapQuote> {
  assertQuoteRequest(request);
  const started = Date.now();
  const params = new URLSearchParams({
    tokenIn: request.amountIn + request.inputDenom,
    tokenOutDenom: request.outputDenom,
    singleRoute: "true",
  });
  const data = await fetchJSON<unknown>(
    "https://sqs.osmosis.zone",
    `/router/quote?${params}`,
    request.signal
  );
  const quote = validateSwapQuote(data, request, started);
  if (quote.expiresAt <= Date.now()) throw new Error("Swap quote expired");
  return quote;
}

async function verifyChannel(
  rest: string,
  channelId: string,
  otherChannel: string,
  otherChainId: string,
  signal?: AbortSignal
): Promise<void> {
  const path = `/ibc/core/channel/v1/channels/${channelId}/ports/transfer`;
  const [channelResponse, clientResponse] = await Promise.all([
    fetchJSON<{
      channel?: {
        state?: string;
        ordering?: string;
        version?: string;
        counterparty?: { port_id?: string; channel_id?: string };
      };
    }>(rest, path, signal),
    fetchJSON<{
      identified_client_state?: {
        client_id?: string;
        client_state?: { chain_id?: string };
      };
    }>(rest, `${path}/client_state`, signal),
  ]);
  const channel = channelResponse.channel;
  if (
    channel?.state !== "STATE_OPEN" ||
    channel.ordering !== "ORDER_UNORDERED" ||
    channel.version !== "ics20-1" ||
    channel.counterparty?.port_id !== "transfer" ||
    channel.counterparty.channel_id !== otherChannel
  )
    throw new Error("The expected Epix-Osmosis IBC channel is not open");
  const client = clientResponse.identified_client_state;
  if (
    client?.client_state?.chain_id !== otherChainId ||
    !client.client_id ||
    !/^07-tendermint-\d+$/.test(client.client_id)
  )
    throw new Error("IBC client does not connect to the expected chain");
  const status = await fetchJSON<{ status?: string }>(
    rest,
    `/ibc/core/client/v1/client_status/${client.client_id}`,
    signal
  );
  if (status.status !== "Active") throw new Error("IBC client is not active");
}

export async function validateBridgeRoute(
  sourceRest: string,
  destinationRest: string,
  signal?: AbortSignal
): Promise<void> {
  await Promise.all([
    verifyChannel(
      sourceRest,
      "channel-0",
      "channel-108456",
      OSMOSIS_CHAIN_ID,
      signal
    ),
    verifyChannel(
      destinationRest,
      "channel-108456",
      "channel-0",
      EPIX_CHAIN_ID,
      signal
    ),
  ]);
}

export async function simulateTx(
  rest: string,
  txBytes: Uint8Array,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetchJSON<{ gas_info?: { gas_used?: unknown } }>(
    rest,
    "/cosmos/tx/v1beta1/simulate",
    signal,
    {
      method: "POST",
      body: JSON.stringify({
        tx_bytes: Buffer.from(txBytes).toString("base64"),
      }),
    }
  );
  const gas = response.gas_info?.gas_used;
  if (!positiveInteger(gas, BigInt(50_000_000)))
    throw new Error("Invalid simulation gas result");
  return gas;
}

export type PacketEvent = {
  type: string;
  attributes: { key: string; value: string }[];
};
const packetKeys = new Set([
  "packet_src_port",
  "packet_src_channel",
  "packet_dst_port",
  "packet_dst_channel",
  "packet_sequence",
  "packet_data",
  "packet_timeout_timestamp",
  "packet_timeout_height",
]);

function decodeEvents(value: unknown): PacketEvent[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("Invalid transaction events");
  return value.map((event: unknown) => {
    if (
      !record(event) ||
      typeof event["type"] !== "string" ||
      !Array.isArray(event["attributes"])
    )
      throw new Error("Invalid transaction events");
    const attributes = event["attributes"].map((attribute: unknown) => {
      if (
        !record(attribute) ||
        typeof attribute["key"] !== "string" ||
        typeof attribute["value"] !== "string"
      )
        throw new Error("Invalid transaction attribute");
      const key = Buffer.from(attribute["key"], "base64").toString();
      if (
        packetKeys.has(key) &&
        Buffer.from(key).toString("base64") === attribute["key"]
      )
        return {
          key,
          value: Buffer.from(attribute["value"], "base64").toString(),
        };
      return { key: attribute["key"], value: attribute["value"] };
    });
    return { type: event["type"], attributes };
  });
}

async function committedTransaction(
  rest: string,
  hash: string,
  signal?: AbortSignal
): Promise<
  | {
      response: Record<string, unknown>;
      result: Record<string, unknown>;
      code: number;
    }
  | undefined
> {
  if (!/^[A-Fa-f0-9]{64}$/.test(hash))
    throw new TypeError("Invalid transaction hash");
  try {
    const response = await fetchJSON<unknown>(
      rest,
      `/cosmos/tx/v1beta1/txs/${hash}`,
      signal
    );
    if (!record(response) || !record(response["tx_response"]))
      throw new Error("Invalid transaction status");
    const tx = response["tx_response"];
    if (
      typeof tx["txhash"] !== "string" ||
      tx["txhash"].toUpperCase() !== hash.toUpperCase() ||
      typeof tx["code"] !== "number" ||
      !Number.isSafeInteger(tx["code"]) ||
      tx["code"] < 0 ||
      tx["code"] > 0xffffffff ||
      !positiveInteger(tx["height"], uint64Max)
    )
      throw new Error("Invalid transaction status");
    return { response, result: tx, code: tx["code"] };
  } catch (error) {
    if (error instanceof SwapHTTPError && error.status === 404)
      return undefined;
    throw error;
  }
}

export async function lookupTx(
  rest: string,
  hash: string,
  signal?: AbortSignal
): Promise<{ code: number; events: PacketEvent[] } | undefined> {
  const tx = await committedTransaction(rest, hash, signal);
  return tx
    ? { code: tx.code, events: decodeEvents(tx.result["events"]) }
    : undefined;
}

export type ExpectedSwapResult = Readonly<{
  sender: string;
  inputDenom: string;
  amountIn: string;
  minimumAmountOut: string;
  outputDenom: string;
}>;

const swapMessageType = "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn";
const swapResponseType = `${swapMessageType}Response`;

function assertExpectedSwap(expected: ExpectedSwapResult): void {
  if (
    typeof expected.sender !== "string" ||
    !expected.sender ||
    expected.sender.length > 128 ||
    !positiveInteger(expected.amountIn) ||
    !positiveInteger(expected.minimumAmountOut) ||
    !validDenom(expected.inputDenom) ||
    !validDenom(expected.outputDenom)
  )
    throw new TypeError("Invalid expected swap");
}

function validCommittedRoute(value: unknown, outputDenom: string): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8)
    return false;
  return (
    value.every(
      (pool) =>
        record(pool) &&
        positiveInteger(pool["pool_id"], uint64Max) &&
        validDenom(pool["token_out_denom"])
    ) && value.at(-1)["token_out_denom"] === outputDenom
  );
}

function assertCommittedSwap(tx: unknown, expected: ExpectedSwapResult): void {
  if (!record(tx) || !record(tx["body"]))
    throw new Error("Invalid committed swap transaction");
  const messages = tx["body"]["messages"];
  if (!Array.isArray(messages) || messages.length !== 1)
    throw new Error("Expected exactly one committed swap message");
  const message: unknown = messages[0];
  if (
    !record(message) ||
    message["@type"] !== swapMessageType ||
    message["sender"] !== expected.sender ||
    !record(message["token_in"]) ||
    message["token_in"]["denom"] !== expected.inputDenom ||
    message["token_in"]["amount"] !== expected.amountIn ||
    message["token_out_min_amount"] !== expected.minimumAmountOut ||
    !validCommittedRoute(message["routes"], expected.outputDenom)
  )
    throw new Error("Committed swap does not match the approved transaction");
}

function committedSwapAmount(data: unknown, minimumAmountOut: string): string {
  if (
    typeof data !== "string" ||
    data.length > 65_536 ||
    !/^(?:[A-Fa-f0-9]{2})+$/.test(data)
  )
    throw new Error("Invalid committed swap response data");
  const messages = TxMsgData.decode(Buffer.from(data, "hex"));
  if (messages.data.length !== 0 || messages.msgResponses.length !== 1)
    throw new Error("Expected exactly one modern swap response");
  const response = messages.msgResponses[0];
  if (response.typeUrl !== swapResponseType)
    throw new Error("Unexpected committed swap response type");
  const amount = MsgSwapExactAmountInResponse.decode(
    response.value
  ).tokenOutAmount;
  if (!positiveInteger(amount) || BigInt(amount) < BigInt(minimumAmountOut))
    throw new Error("Invalid committed swap output amount");
  return amount;
}

/** Read only the exact committed swap result, never an account balance delta. */
export async function lookupSwapResult(
  rest: string,
  hash: string,
  expected: ExpectedSwapResult,
  signal?: AbortSignal
): Promise<{ code: number; amountOut?: string } | undefined> {
  assertExpectedSwap(expected);
  const tx = await committedTransaction(rest, hash, signal);
  if (!tx) return undefined;
  assertCommittedSwap(tx.response["tx"], expected);
  if (tx.code !== 0) return { code: tx.code };
  return {
    code: 0,
    amountOut: committedSwapAmount(
      tx.result["data"],
      expected.minimumAmountOut
    ),
  };
}

export async function packetAck(
  destinationRest: string,
  sequence: string,
  signal?: AbortSignal,
  direction: EpixSwapDirection = "to-osmosis"
): Promise<"pending" | "received" | "unknown"> {
  if (!positiveInteger(sequence, uint64Max))
    throw new TypeError("Invalid packet sequence");
  if (direction !== "to-osmosis" && direction !== "to-epix")
    throw new TypeError("Invalid bridge direction");
  const channel = direction === "to-epix" ? "channel-0" : "channel-108456";
  try {
    const response = await fetchJSON<{ acknowledgement?: string }>(
      destinationRest,
      `/ibc/core/channel/v1/channels/${channel}/ports/transfer/packet_acks/${sequence}`,
      signal
    );
    return response.acknowledgement ===
      "CPdVftUYJv4Y2EUSvyTsdQAe268hI6R333KgqfNkCnw="
      ? "received"
      : "unknown";
  } catch (error) {
    if (error instanceof SwapHTTPError && error.status === 404)
      return "pending";
    throw error;
  }
}
