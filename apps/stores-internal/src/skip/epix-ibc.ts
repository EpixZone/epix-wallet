import { InternalChainStore } from "../internal";
import { IBCChannel } from "./types";

const EPIX_CHAIN_ID = "epix_1916-1";
const OSMOSIS_CHAIN_ID = "osmosis-1";
// sha256("transfer/channel-108456/aepix"). allEPIX is a separate asset
// that must be swapped to this voucher before returning to Epix.
const EPIX_OSMOSIS_DENOM =
  "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF";

// Keep the direct native EPIX route available without the remote route index.
export function getEpixIBCChannels(
  chainStore: InternalChainStore,
  chainId: string,
  denom: string
): IBCChannel[] {
  const returning =
    chainId === OSMOSIS_CHAIN_ID && denom === EPIX_OSMOSIS_DENOM;
  if (!returning && !(chainId === EPIX_CHAIN_ID && denom === "aepix")) {
    return [];
  }

  const destinationChainId = returning ? EPIX_CHAIN_ID : OSMOSIS_CHAIN_ID;
  if (
    !chainStore.hasModularChain(chainId) ||
    !chainStore.hasModularChain(destinationChainId) ||
    !chainStore.isInChainInfosInListUI(destinationChainId)
  ) {
    return [];
  }
  for (const id of [chainId, destinationChainId]) {
    const chain = chainStore.getModularChain(id);
    if (chain.isTestnet || !chain.hasFeature("ibc-transfer")) return [];
  }

  return [
    {
      destinationChainId,
      originChainId: EPIX_CHAIN_ID,
      originDenom: "aepix",
      denom: returning ? "aepix" : EPIX_OSMOSIS_DENOM,
      channels: [
        {
          portId: "transfer",
          channelId: returning ? "channel-108456" : "channel-0",
          counterpartyChainId: destinationChainId,
        },
      ],
    },
  ];
}
