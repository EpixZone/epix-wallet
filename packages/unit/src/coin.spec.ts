import { Coin } from "./coin";

describe("Test coin", () => {
  it("coin parsed from str properly", () => {
    let coin = Coin.parse("1000test");

    expect(coin.denom).toBe("test");
    expect(coin.amount.toString()).toBe("1000");
    expect(coin.toString()).toBe("1000test");

    coin = Coin.parse("1000tesT");

    expect(coin.denom).toBe("tesT");
    expect(coin.amount.toString()).toBe("1000");
    expect(coin.toString()).toBe("1000tesT");

    coin = Coin.parse("1000TEST");

    expect(coin.denom).toBe("TEST");
    expect(coin.amount.toString()).toBe("1000");
    expect(coin.toString()).toBe("1000TEST");

    coin = Coin.parse("1000 TEST");

    expect(coin.denom).toBe("TEST");
    expect(coin.amount.toString()).toBe("1000");
    expect(coin.toString()).toBe("1000TEST");

    coin = Coin.parse("1000  TEST");

    expect(coin.denom).toBe("TEST");
    expect(coin.amount.toString()).toBe("1000");
    expect(coin.toString()).toBe("1000TEST");

    expect(() => Coin.parse("ascasc")).toThrow();
    expect(() => Coin.parse("ascasc asd")).toThrow();
    expect(() => Coin.parse("100 ascasc asd")).toThrow();
    expect(() => Coin.parse("asd 100")).toThrow();
  });
});

test.each([
  "100atom\n",
  "prefix100atom",
  "-100atom",
  "1.5atom",
  "0".repeat(100000),
  "0".repeat(100000) + "!",
])("rejects malformed coins without accepting a numeric suffix", (value) =>
  expect(() => Coin.parse(value)).toThrow("Invalid coin str")
);
