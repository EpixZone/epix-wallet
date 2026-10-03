import { EPIX_TX_EXPLORER } from "../../config.ui";
import { EPIX_CHAIN_ID, OSMOSIS_CHAIN_ID } from "./tokens";

// Cosmos chain-registry/osmosis/chain.json lists this Mintscan transaction route.
const OSMOSIS_TX_EXPLORER =
  "https://www.mintscan.io/osmosis/transactions/{txHash}";
export function transactionExplorerUrl(
  chainId: string,
  hash: string
): string | undefined {
  if (hash.length !== 64 || !/^[A-Fa-f0-9]+$/.test(hash)) return undefined;
  const templates: Record<string, string> = {
    [EPIX_CHAIN_ID]: EPIX_TX_EXPLORER,
    [OSMOSIS_CHAIN_ID]: OSMOSIS_TX_EXPLORER,
  };
  return templates[chainId]?.replace("{txHash}", hash.toUpperCase());
}
