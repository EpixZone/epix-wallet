import Long from "long";

const MAX_UINT64 = "18446744073709551615";

// Provider messages carry decimal strings, while the public signing API uses
// Long. Validate before conversion so overflow and unsafe JS numbers cannot
// silently wrap or round an account number or sequence.
export function toUint64(value: unknown): Long {
  if (Long.isLong(value)) {
    value = value.toString();
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Unsafe uint64 signing value");
    }
    value = value.toString();
  } else if (typeof value === "bigint") {
    value = value.toString();
  }
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    value.length > MAX_UINT64.length ||
    (value.length === MAX_UINT64.length && value > MAX_UINT64)
  ) {
    throw new Error("Invalid uint64 signing value");
  }
  return Long.fromString(value, true);
}
