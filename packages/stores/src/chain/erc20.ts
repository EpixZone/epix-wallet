import { DenomHelper } from "@keplr-wallet/common";
import { getAddress as getEthAddress } from "@ethersproject/address";
import { Coin } from "@keplr-wallet/types";

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

export function findERC20CosmosBankBalance(
  balances: readonly Coin[] | undefined,
  coinMinimalDenom: string
): Coin | undefined {
  const normalizedCoinMinimalDenom =
    DenomHelper.normalizeDenom(coinMinimalDenom);

  return balances?.find(
    (balance) =>
      DenomHelper.normalizeDenom(balance.denom) === normalizedCoinMinimalDenom
  );
}

export function getERC20CosmosBankDenom(coinMinimalDenom: string): string {
  const denomHelper = new DenomHelper(coinMinimalDenom);
  if (denomHelper.type !== "erc20") {
    throw new Error("Invalid ERC20 denom");
  }

  const contractAddress = denomHelper.contractAddress.match(/^0x/i)
    ? denomHelper.contractAddress
    : `0x${denomHelper.contractAddress}`;
  return `erc20:${getEthAddress(contractAddress)}`;
}
