export type EndpointTuple = Readonly<{
  rpc: string;
  rest: string;
  evmRpc?: string;
}>;

export interface EndpointProfile {
  readonly provider: string;
  readonly endpoints: EndpointTuple;
}

export interface EndpointInventory {
  readonly chainId: string;
  readonly evmChainId?: string;
  readonly profiles: readonly EndpointProfile[];
}

// Reviewed public candidates, not a claim of availability. Every selection is
// checked against the exact network and a fresh block before activation.
export const ENDPOINT_INVENTORY_SOURCE =
  "https://github.com/cosmos/chain-registry/tree/7d9edfe67e640098cdc81924cc6bf6053755963e";

export const ENDPOINT_INVENTORY: readonly EndpointInventory[] = Object.freeze(
  [
    {
      chainId: "epix_1916-1",
      evmChainId: "1916",
      profiles: [
        {
          provider: "Epix",
          endpoints: {
            rpc: "https://rpc.epix.zone",
            rest: "https://api.epix.zone",
            evmRpc: "https://evmrpc.epix.zone",
          },
        },
        {
          provider: "OneNov",
          endpoints: {
            rpc: "https://rpc-epix.onenov.xyz",
            rest: "https://api-epix.onenov.xyz",
            evmRpc: "https://evm-epix.onenov.xyz",
          },
        },
        {
          provider: "Vinjan",
          endpoints: {
            rpc: "https://rpc-epix.vinjan-inc.com",
            rest: "https://api-epix.vinjan-inc.com",
            evmRpc: "https://evm-epix.vinjan-inc.com",
          },
        },
      ],
    },
    {
      chainId: "osmosis-1",
      profiles: [
        {
          provider: "Keplr",
          endpoints: {
            rpc: "https://rpc-osmosis.keplr.app",
            rest: "https://lcd-osmosis.keplr.app",
          },
        },
        {
          provider: "Osmosis Foundation",
          endpoints: {
            rpc: "https://rpc.osmosis.zone",
            rest: "https://lcd.osmosis.zone",
          },
        },
        {
          provider: "LavenderFive",
          endpoints: {
            rpc: "https://rpc.lavenderfive.com:443/osmosis",
            rest: "https://rest.lavenderfive.com:443/osmosis",
          },
        },
      ],
    },
  ].map((chain) =>
    Object.freeze({
      ...chain,
      profiles: Object.freeze(
        chain.profiles.map((profile) =>
          Object.freeze({
            ...profile,
            endpoints: Object.freeze(profile.endpoints),
          })
        )
      ),
    })
  )
);

export function getEndpointInventory(
  chainId: string
): EndpointInventory | undefined {
  return ENDPOINT_INVENTORY.find((chain) => chain.chainId === chainId);
}
