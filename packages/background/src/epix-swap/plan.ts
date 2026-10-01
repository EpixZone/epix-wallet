import { StdFee } from "@keplr-wallet/types";
import { MsgTransfer } from "@keplr-wallet/proto-types/ibc/applications/transfer/v1/tx";
import { MsgSwapExactAmountIn } from "@keplr-wallet/proto-types/osmosis/poolmanager/v1beta1/tx";
import { Any } from "@keplr-wallet/proto-types/google/protobuf/any";
import { EpixSwapOperation } from "./types";

export const OSMOSIS_EPIX_DENOM =
  "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF";
export const OUTPUT_DENOMS = new Set([
  "uosmo",
  "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4",
  "factory/osmo1z6r6qdknhgsc0zeracktgpcxf43j6sekq07nw8sxduc9lg0qjjlqfu25e3/alloyed/allBTC",
]);
export const MAX_SWAP_GAS = "2000000";
export const MAX_BRIDGE_GAS = "350000";
export const APPROVAL_DURATION_MS = 15 * 60 * 1000;

export function assertSelection(
  amount: string,
  output: string,
  slippage: number,
  feeDenom: string
): void {
  if (
    !/^[1-9][0-9]{0,77}$/.test(amount) ||
    BigInt(amount) >=
      BigInt(
        "115792089237316195423570985008687907853269984665640564039457584007913129639936"
      )
  )
    throw new TypeError("Invalid swap amount");
  if (!OUTPUT_DENOMS.has(output) || !OUTPUT_DENOMS.has(feeDenom))
    throw new TypeError("Unsupported swap asset");
  if (!Number.isInteger(slippage) || slippage < 1 || slippage > 500)
    throw new TypeError("Slippage must be between 0.01% and 5%");
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
        sourceChannel: "channel-0",
        sender: operation.sourceAddress,
        receiver: operation.destinationAddress,
        token: { denom: "aepix", amount: operation.amountIn },
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
      sender: operation.destinationAddress,
      routes,
      tokenIn: { denom: OSMOSIS_EPIX_DENOM, amount: operation.amountIn },
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
      a["packet_src_channel"] !== "channel-0" ||
      a["packet_dst_port"] !== "transfer" ||
      a["packet_dst_channel"] !== "channel-108456"
    )
      continue;
    const data = JSON.parse(a["packet_data"]) as Record<string, unknown>;
    if (
      data["sender"] !== operation.sourceAddress ||
      data["receiver"] !== operation.destinationAddress ||
      data["denom"] !== "aepix" ||
      data["amount"] !== operation.amountIn ||
      a["packet_timeout_timestamp"] !== operation.packetTimeoutTimestamp ||
      !/^[1-9][0-9]*$/.test(a["packet_sequence"])
    )
      continue;
    return a["packet_sequence"];
  }
  throw new Error(
    "The transaction does not contain the approved deposit packet."
  );
}

export function publicCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
