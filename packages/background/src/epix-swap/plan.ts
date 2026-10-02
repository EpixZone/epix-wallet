import { StdFee } from "@keplr-wallet/types";
import { MsgTransfer } from "@keplr-wallet/proto-types/ibc/applications/transfer/v1/tx";
import { MsgSwapExactAmountIn } from "@keplr-wallet/proto-types/osmosis/poolmanager/v1beta1/tx";
import { Any } from "@keplr-wallet/proto-types/google/protobuf/any";
import { EpixSwapDirection, EpixSwapOperation } from "./types";
import {
  EPIX_CHAIN_ID,
  OSMOSIS_CHAIN_ID,
  SUPPORTED_FEE_DENOMS,
  SUPPORTED_OUTPUT_DENOMS,
} from "./constants";

export const OSMOSIS_EPIX_DENOM =
  "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF";
export const OUTPUT_DENOMS = new Set<string>(SUPPORTED_OUTPUT_DENOMS);
const FEE_DENOMS = new Set<string>(SUPPORTED_FEE_DENOMS);
export const MAX_SWAP_GAS = "2000000";
export const MAX_BRIDGE_GAS = "350000";
export const APPROVAL_DURATION_MS = 15 * 60 * 1000;

export function assertSelection(
  direction: EpixSwapDirection,
  input: string,
  amount: string,
  output: string,
  slippage: number,
  feeDenom: string
): void {
  if (
    !/^[1-9]\d{0,77}$/.test(amount) ||
    BigInt(amount) >=
      BigInt(
        "115792089237316195423570985008687907853269984665640564039457584007913129639936"
      )
  )
    throw new TypeError("Invalid swap amount");
  const validPair =
    direction === "to-osmosis"
      ? input === "aepix" && OUTPUT_DENOMS.has(output)
      : direction === "to-epix" &&
        OUTPUT_DENOMS.has(input) &&
        output === "aepix";
  if (!validPair || !FEE_DENOMS.has(feeDenom))
    throw new TypeError("Unsupported swap asset");
  if (!Number.isInteger(slippage) || slippage < 1 || slippage > 500)
    throw new TypeError("Slippage must be between 0.01% and 5%");
}

export function chainPair(direction: EpixSwapDirection) {
  return direction === "to-osmosis"
    ? { sourceChainId: EPIX_CHAIN_ID, destinationChainId: OSMOSIS_CHAIN_ID }
    : { sourceChainId: OSMOSIS_CHAIN_ID, destinationChainId: EPIX_CHAIN_ID };
}
export function osmosisRest(operation: EpixSwapOperation): string {
  return operation.direction === "to-osmosis"
    ? operation.destinationRest
    : operation.sourceRest;
}
export function osmosisAddress(operation: EpixSwapOperation): string {
  return operation.direction === "to-osmosis"
    ? operation.destinationAddress
    : operation.sourceAddress;
}
export function quoteSelection(
  operation: Pick<
    EpixSwapOperation,
    "direction" | "inputDenom" | "outputDenom" | "amountIn" | "slippageBps"
  >
) {
  return {
    direction: operation.direction,
    inputDenom:
      operation.direction === "to-osmosis"
        ? OSMOSIS_EPIX_DENOM
        : operation.inputDenom,
    outputDenom:
      operation.direction === "to-osmosis"
        ? operation.outputDenom
        : OSMOSIS_EPIX_DENOM,
    amountIn: operation.amountIn,
    slippageBps: operation.slippageBps,
  };
}
function transferAmount(operation: EpixSwapOperation): string {
  if (operation.direction === "to-osmosis") return operation.amountIn;
  if (!operation.swapConfirmed || !operation.swapAmountOut)
    throw new Error("The received swap output has not been verified.");
  return operation.swapAmountOut;
}

export function assertFeeWithin(fee: StdFee, cap: StdFee): void {
  const coin = fee.amount[0];
  const limit = cap.amount[0];
  if (
    fee.amount.length !== 1 ||
    cap.amount.length !== 1 ||
    !coin ||
    !limit ||
    coin.denom !== limit.denom ||
    BigInt(fee.gas) > BigInt(cap.gas) ||
    BigInt(coin.amount) > BigInt(limit.amount)
  ) {
    throw new Error(
      "The required fee exceeds the approved maximum. Review again."
    );
  }
}

export function bridgeMessage(operation: EpixSwapOperation): Any {
  if (!operation.packetTimeoutTimestamp)
    throw new Error("Missing bridge timeout");
  return {
    typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
    value: MsgTransfer.encode(
      MsgTransfer.fromPartial({
        sourcePort: "transfer",
        sourceChannel:
          operation.direction === "to-osmosis" ? "channel-0" : "channel-108456",
        sender: operation.sourceAddress,
        receiver: operation.destinationAddress,
        token: {
          denom:
            operation.direction === "to-osmosis" ? "aepix" : OSMOSIS_EPIX_DENOM,
          amount: transferAmount(operation),
        },
        timeoutHeight: { revisionNumber: "0", revisionHeight: "0" },
        timeoutTimestamp: operation.packetTimeoutTimestamp,
      })
    ).finish(),
  };
}

export function swapMessage(
  operation: EpixSwapOperation,
  routes: { poolId: string; tokenOutDenom: string }[]
): Any {
  return {
    typeUrl: "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn",
    value: MsgSwapExactAmountIn.encode({
      sender: osmosisAddress(operation),
      routes,
      tokenIn: {
        denom: quoteSelection(operation).inputDenom,
        amount: operation.amountIn,
      },
      tokenOutMinAmount: operation.minimumAmountOut,
    }).finish(),
  };
}

type Event = { type: string; attributes: { key: string; value: string }[] };
export function matchingPacketSequence(
  events: Event[],
  operation: EpixSwapOperation
): string {
  for (const event of events) {
    if (event.type !== "send_packet") continue;
    const a = Object.fromEntries(
      event.attributes.map(({ key, value }) => [key, value])
    );
    if (
      a["packet_src_port"] !== "transfer" ||
      a["packet_src_channel"] !==
        (operation.direction === "to-osmosis"
          ? "channel-0"
          : "channel-108456") ||
      a["packet_dst_port"] !== "transfer" ||
      a["packet_dst_channel"] !==
        (operation.direction === "to-osmosis" ? "channel-108456" : "channel-0")
    )
      continue;
    const data = JSON.parse(a["packet_data"]) as Record<string, unknown>;
    if (
      data["sender"] !== operation.sourceAddress ||
      data["receiver"] !== operation.destinationAddress ||
      data["denom"] !==
        (operation.direction === "to-osmosis"
          ? "aepix"
          : "transfer/channel-108456/aepix") ||
      data["amount"] !== transferAmount(operation) ||
      a["packet_timeout_timestamp"] !== operation.packetTimeoutTimestamp ||
      !/^[1-9]\d*$/.test(a["packet_sequence"])
    )
      continue;
    return a["packet_sequence"];
  }
  throw new Error(
    "The transaction does not contain the approved deposit packet."
  );
}

export function publicCopy<T>(value: T): T {
  return structuredClone(value);
}
