export function shouldQueryERC20WithCosmosBank(
  chainIdentifier: string
): boolean {
  // Injective exposes MTS ERC20 balances through the Cosmos bank module.
  // Injective dev/testnets are kept as full chain identifiers by ChainIdHelper.
  // Other Ethermint chains should keep using the EVM ERC20 balance path.
  return (
    chainIdentifier === "injective" ||
    chainIdentifier === "injective-777" ||
    chainIdentifier === "injective-888"
  );
}
