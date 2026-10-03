import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { AppCurrency } from "@keplr-wallet/types";
import { InternalChainStore } from "../internal";
import { ObservableQueryAssetsBatch } from "./assets";
import { ObservableQueryAssetsFromSource } from "./assets-from-source";
import { ObservableQueryChains } from "./chains";
import { getEpixIBCChannels } from "./epix-ibc";
import { ObservableQueryIbcPfmTransfer } from "./ibc-pfm-transfer";

const epix = "epix_1916-1";
const osmosis = "osmosis-1";
const voucher =
  "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF";
const allEpix =
  "factory/osmo130tfawc7katf7jwzt2rjdranhqju929rjra3xwsrfsd85hedh3tsssy9j7/alloyed/allEPIX";
const nativeCurrency = {
  coinDenom: "EPIX",
  coinMinimalDenom: "aepix",
  coinDecimals: 18,
};

function mockChain(chainId: string, chainName: string) {
  const currencies = new Map<string, AppCurrency>();
  return {
    chainId,
    chainIdentifier: ChainIdHelper.parse(chainId).identifier,
    chainName,
    isTestnet: false,
    currencies,
    hasFeature: jest.fn((feature: string) => feature === "ibc-transfer"),
    findCurrencyWithoutReaction: jest.fn((denom: string) =>
      currencies.get(denom)
    ),
  };
}

function requiredChain(
  chains: ReadonlyMap<string, ReturnType<typeof mockChain>>,
  chainId: string
) {
  const chain = chains.get(chainId);
  if (!chain) throw new Error("Unknown test chain");
  return chain;
}

function fixture() {
  const chains = new Map([
    [epix, mockChain(epix, "Epix")],
    [osmosis, mockChain(osmosis, "Osmosis")],
  ]);
  requiredChain(chains, epix).currencies.set("aepix", nativeCurrency);
  // The persisted embedded currency has no remotely resolved IBC paths.
  requiredChain(chains, osmosis).currencies.set(voucher, {
    ...nativeCurrency,
    coinMinimalDenom: voucher,
  });
  const hidden = new Set<string>();
  const chainStore = {
    hasModularChain: (chainId: string) => chains.has(chainId),
    getModularChain: (chainId: string) => requiredChain(chains, chainId),
    isInChainInfosInListUI: (chainId: string) => !hidden.has(chainId),
  } as unknown as InternalChainStore;
  return { chainStore, chains, hidden };
}

function transferQuery(
  chainStore: InternalChainStore,
  assetsFromSource: unknown
) {
  const query = new ObservableQueryIbcPfmTransfer(
    chainStore,
    {} as ObservableQueryChains,
    {} as ObservableQueryAssetsBatch,
    {
      getSourceAsset: jest.fn(() => ({ assetsFromSource })),
    } as unknown as ObservableQueryAssetsFromSource
  );
  return query;
}

const directions = [
  {
    source: epix,
    input: "aepix",
    destination: osmosis,
    output: voucher,
    channel: "channel-0",
  },
  {
    source: osmosis,
    input: voucher,
    destination: epix,
    output: "aepix",
    channel: "channel-108456",
  },
];

describe.each(directions)("$source direct EPIX route", (direction) => {
  const expected = [
    {
      destinationChainId: direction.destination,
      originChainId: epix,
      originDenom: "aepix",
      denom: direction.output,
      channels: [
        {
          portId: "transfer",
          channelId: direction.channel,
          counterpartyChainId: direction.destination,
        },
      ],
    },
  ];

  it("returns the exact direct route without currency path metadata", () => {
    const { chainStore } = fixture();
    expect(
      getEpixIBCChannels(chainStore, direction.source, direction.input)
    ).toEqual(expected);
  });

  it.each([undefined, {}])(
    "keeps the route when remote asset data is %p",
    (remote) => {
      const { chainStore } = fixture();
      expect(
        transferQuery(chainStore, remote).getIBCChannels(
          direction.source,
          direction.input
        )
      ).toEqual(expected);
    }
  );

  it.each(["source", "destination"] as const)(
    "requires registered %s chain metadata",
    (side) => {
      const { chainStore, chains } = fixture();
      chains.delete(direction[side]);
      expect(
        getEpixIBCChannels(chainStore, direction.source, direction.input)
      ).toEqual([]);
      expect(
        transferQuery(chainStore, {}).getIBCChannels(
          direction.source,
          direction.input
        )
      ).toEqual([]);
    }
  );

  it.each(["source", "destination"] as const)(
    "requires the %s chain to support IBC transfer",
    (side) => {
      const { chainStore, chains } = fixture();
      requiredChain(chains, direction[side]).hasFeature.mockReturnValue(false);
      expect(
        getEpixIBCChannels(chainStore, direction.source, direction.input)
      ).toEqual([]);
      expect(
        transferQuery(chainStore, {}).getIBCChannels(
          direction.source,
          direction.input
        )
      ).toEqual([]);
    }
  );

  it.each(["source", "destination"] as const)(
    "excludes a %s chain marked as testnet",
    (side) => {
      const { chainStore, chains } = fixture();
      requiredChain(chains, direction[side]).isTestnet = true;
      expect(
        getEpixIBCChannels(chainStore, direction.source, direction.input)
      ).toEqual([]);
      expect(
        transferQuery(chainStore, {}).getIBCChannels(
          direction.source,
          direction.input
        )
      ).toEqual([]);
    }
  );

  it("does not add a hidden destination", () => {
    const { chainStore, hidden } = fixture();
    hidden.add(direction.destination);
    expect(
      getEpixIBCChannels(chainStore, direction.source, direction.input)
    ).toEqual([]);
    expect(
      transferQuery(chainStore, {}).getIBCChannels(
        direction.source,
        direction.input
      )
    ).toEqual([]);
  });
});

it.each([
  [osmosis, allEpix],
  [osmosis, "aepix"],
  [osmosis, "uosmo"],
  [osmosis, "ibc/" + "A".repeat(64)],
  [osmosis, voucher.toLowerCase()],
  [epix, voucher],
  [epix, "AEPix"],
  ["osmosis-2", voucher],
  ["epix_1916-2", "aepix"],
  ["unrelated-1", voucher],
])("does not invent an EPIX route for %s and %s", (chainId, denom) => {
  const { chainStore, chains } = fixture();
  if (!chains.has(chainId)) {
    chains.set(chainId, mockChain(chainId, "Unrelated chain"));
  }
  expect(getEpixIBCChannels(chainStore, chainId, denom)).toEqual([]);
  expect(transferQuery(chainStore, {}).getIBCChannels(chainId, denom)).toEqual(
    []
  );
});

it("prefers the exact local destination while preserving unrelated remote routes", () => {
  const { chainStore, chains } = fixture();
  const hub = "cosmoshub-4";
  const hubVoucher = "ibc/" + "B".repeat(64);
  chains.set(hub, mockChain(hub, "Cosmos Hub"));
  for (const [chainId, denom, remoteChannel] of [
    [osmosis, voucher, "channel-999"],
    [hub, hubVoucher, "channel-5"],
  ]) {
    requiredChain(chains, chainId).currencies.set(denom, {
      ...nativeCurrency,
      coinMinimalDenom: denom,
      originChainId: epix,
      originCurrency: nativeCurrency,
      paths: [
        {
          portId: "transfer",
          channelId: "channel-42",
          counterpartyPortId: "transfer",
          counterpartyChannelId: remoteChannel,
          clientChainId: epix,
        },
      ],
    });
  }
  const remote = Object.fromEntries(
    [
      [osmosis, voucher],
      [hub, hubVoucher],
    ].map(([chainId, denom]) => [
      chainId,
      {
        assets: [{ chainId, denom, originChainId: epix, originDenom: "aepix" }],
      },
    ])
  );
  const routes = transferQuery(chainStore, remote).getIBCChannels(
    epix,
    "aepix"
  );
  expect(routes).toHaveLength(2);
  expect(routes.map((route) => route.destinationChainId)).toEqual([
    hub,
    osmosis,
  ]);
  expect(routes.find((route) => route.destinationChainId === osmosis)).toEqual(
    getEpixIBCChannels(chainStore, epix, "aepix")[0]
  );
  expect(routes.find((route) => route.destinationChainId === hub)).toEqual({
    destinationChainId: hub,
    originChainId: epix,
    originDenom: "aepix",
    denom: hubVoucher,
    channels: [
      {
        portId: "transfer",
        channelId: "channel-5",
        counterpartyChainId: hub,
      },
    ],
  });
});
