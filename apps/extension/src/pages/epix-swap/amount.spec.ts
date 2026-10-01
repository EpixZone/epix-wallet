import { parseAmountToMinimal } from "./amount";

describe("exact bridge amounts", () => {
  it("preserves one aepix beyond one EPIX and large integral amounts", () => {
    expect(parseAmountToMinimal("1.000000000000000001", 18)).toBe(
      "1000000000000000001"
    );
    expect(parseAmountToMinimal("9007199254740993", 18)).toBe(
      "9007199254740993000000000000000000"
    );
    expect(parseAmountToMinimal("0.000001", 6)).toBe("1");
  });

  it.each(["0", "-1", "1e3", "NaN", "Infinity", " 1", "1.0000000000000000001"])(
    "rejects invalid or lossy input %s",
    (amount) => expect(() => parseAmountToMinimal(amount, 18)).toThrow()
  );

  it("bounds parsing and the Cosmos 256-bit integer range", () => {
    expect(() => parseAmountToMinimal("9".repeat(10000), 18)).toThrow();
    expect(() => parseAmountToMinimal("9".repeat(78), 0)).toThrow();
    expect(() => parseAmountToMinimal("1", 19)).toThrow();
  });
});
