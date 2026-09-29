import { ChainIdHelper } from "./cosmos";

test.each([
  ["cosmoshub-4", "cosmoshub", 4],
  ["chain-with-dashes-12", "chain-with-dashes", 12],
  ["ethermint_9000-1", "ethermint_9000", 1],
  ["unversioned", "unversioned", 0],
  ["chain-1suffix", "chain-1suffix", 0],
  ["-1", "-1", 0],
  ["chain-1\n", "chain-1\n", 0],
  ["injective-777", "injective-777", 0],
  ["injective-888", "injective-888", 0],
])("parses %s", (input, identifier, version) => {
  expect(ChainIdHelper.parse(input as string)).toEqual({ identifier, version });
});

test("handles long identifiers without a version separator", () => {
  const chainId = "a".repeat(100000);
  expect(ChainIdHelper.parse(chainId)).toEqual({
    identifier: chainId,
    version: 0,
  });
});
