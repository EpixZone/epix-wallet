import { useStore } from "../stores";
import { DenomHelper } from "@keplr-wallet/common";
import { ViewToken } from "../pages/main";

export const useCopyAddress = (viewToken: ViewToken): string | undefined => {
  const { accountStore } = useStore();

  const denomHelper = new DenomHelper(
    viewToken.token.currency.coinMinimalDenom
  );
  const account = accountStore.getAccount(viewToken.chainInfo.chainId);

  if (viewToken.chainInfo.type === "bitcoin") {
    return account.bitcoinAddress?.bech32Address;
  }

  // only ETH and STRK are supported on Starknet
  if (viewToken.chainInfo.type === "starknet") {
    if (denomHelper.type !== "erc20") {
      return undefined;
    }

    const u = viewToken.chainInfo.unwrapped;
    if (u.type !== "starknet") {
      return undefined;
    }

    const { ethContractAddress, strkContractAddress } = u.starknet;
    const isSupportedToken =
      denomHelper.contractAddress === ethContractAddress ||
      denomHelper.contractAddress === strkContractAddress;

    if (!isSupportedToken) {
      return undefined;
    }

    return account.starknetHexAddress;
  }

  if (
    viewToken.chainInfo.type === "evm" ||
    (viewToken.chainInfo.type === "ethermint" && denomHelper.type === "erc20")
  ) {
    return account.ethereumHexAddress;
  }

  if (
    denomHelper.type !== "native" ||
    viewToken.token.currency.coinMinimalDenom.startsWith("ibc/")
  ) {
    return undefined;
  }

  return account.bech32Address;
};
