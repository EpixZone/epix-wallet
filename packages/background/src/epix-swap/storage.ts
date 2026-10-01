import { StdFee } from "@keplr-wallet/types";
import { EpixSwapOperation } from "./types";
import { assertSelection, publicCopy } from "./plan";

const fields = new Set([
  "id",
  "vaultId",
  "sourceAddress",
  "destinationAddress",
  "amountIn",
  "outputDenom",
  "minimumAmountOut",
  "estimatedAmountOut",
  "slippageBps",
  "feeDenom",
  "bridgeFee",
  "swapFeeCap",
  "sourceRest",
  "destinationRest",
  "status",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "bridgeTxHash",
  "swapTxHash",
  "packetSequence",
  "packetTimeoutTimestamp",
  "depositConfirmed",
  "error",
]);
const statuses = new Set([
  "bridging",
  "waiting-for-deposit",
  "swapping",
  "complete",
  "paused",
  "failed",
]);

/** Reject extra fields, particularly signatures or serialized transactions. */
export function readStoredOperation(
  value: EpixSwapOperation
): EpixSwapOperation {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).some((key) => !fields.has(key))
  )
    throw new TypeError("Invalid public swap record");
  assertSelection(
    value.amountIn,
    value.outputDenom,
    value.slippageBps,
    value.feeDenom
  );
  validateIdentity(value);
  validateProgress(value);
  validateFee(value.bridgeFee);
  validateFee(value.swapFeeCap);
  return publicCopy(value);
}

function validateIdentity(value: EpixSwapOperation): void {
  for (const field of [
    value.id,
    value.vaultId,
    value.sourceAddress,
    value.destinationAddress,
    value.sourceRest,
    value.destinationRest,
  ]) {
    if (typeof field !== "string" || !field || field.length > 2048)
      throw new TypeError("Invalid public swap identity");
  }
  if (
    !statuses.has(value.status) ||
    typeof value.depositConfirmed !== "boolean"
  )
    throw new TypeError("Invalid public swap status");
}

function validateProgress(value: EpixSwapOperation): void {
  for (const time of [value.createdAt, value.updatedAt, value.expiresAt]) {
    if (!Number.isSafeInteger(time) || time < 0)
      throw new TypeError("Invalid swap timestamp");
  }
  for (const hash of [value.bridgeTxHash, value.swapTxHash]) {
    if (hash !== undefined && !/^[A-Fa-f0-9]{64}$/.test(hash))
      throw new TypeError("Invalid swap hash");
  }
  validatePacketAndOutput(value);
}

function validatePacketAndOutput(value: EpixSwapOperation): void {
  for (const amount of [value.minimumAmountOut, value.estimatedAmountOut]) {
    if (typeof amount !== "string" || !/^[1-9]\d{0,77}$/.test(amount))
      throw new TypeError("Invalid swap output");
  }
  for (const count of [value.packetSequence, value.packetTimeoutTimestamp]) {
    if (
      count !== undefined &&
      (typeof count !== "string" ||
        !/^[1-9]\d{0,19}$/.test(count) ||
        BigInt(count) > BigInt("18446744073709551615"))
    )
      throw new TypeError("Invalid packet reference");
  }
  if (
    value.error !== undefined &&
    (typeof value.error !== "string" || value.error.length > 300)
  )
    throw new TypeError("Invalid swap error");
}

function validateFee(fee: StdFee): void {
  if (
    !fee ||
    !/^(?:0|[1-9]\d{0,15})$/.test(fee.gas) ||
    fee.amount?.length !== 1
  )
    throw new TypeError("Invalid public fee");
  if (Object.keys(fee).some((key) => key !== "gas" && key !== "amount"))
    throw new TypeError("Invalid public fee fields");
  const coin = fee.amount[0];
  if (Object.keys(coin).some((key) => key !== "denom" && key !== "amount"))
    throw new TypeError("Invalid public coin fields");
  if (
    typeof coin.denom !== "string" ||
    !/^(?:0|[1-9]\d{0,77})$/.test(coin.amount)
  )
    throw new TypeError("Invalid public fee amount");
}
