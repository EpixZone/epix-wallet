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
