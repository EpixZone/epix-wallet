import { EthereumAccountBase } from "./base";

describe("EthereumAccountBase.isEthereumHexAddressWithChecksum", () => {
  it.each([
    "0x0000000000000000000000000000000000000000",
    "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
    "0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED",
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  ])("accepts a valid address: %s", (address) => {
    expect(EthereumAccountBase.isEthereumHexAddressWithChecksum(address)).toBe(
      true
    );
  });

  it.each([
    "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "0X5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
    "5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
    "0x5gaeb6053f3e94c9b9a09f33669435e7ef1beaed",
    "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beae",
    "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed0",
    `0x${"a".repeat(39)}\n`,
    "",
  ])("rejects an invalid address: %s", (address) => {
    expect(EthereumAccountBase.isEthereumHexAddressWithChecksum(address)).toBe(
      false
    );
  });

  it.each(["A", "a"])("rejects oversized %s input", (character) => {
    expect(
      EthereumAccountBase.isEthereumHexAddressWithChecksum(
        `0x${character.repeat(10000)}`
      )
    ).toBe(false);
  });
});
