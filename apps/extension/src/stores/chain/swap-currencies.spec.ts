import { ChainInfo, ModularChainInfo } from "@keplr-wallet/types";
import {
  OSMOSIS_SWAP_TOKENS,
  withOsmosisSwapCurrencies,
} from "./swap-currencies";
import { OSMOSIS_SWAP_TOKENS as pageTokens } from "../../pages/epix-swap/tokens";

const osmo = {
  coinDenom: "OSMO",
  coinMinimalDenom: "uosmo",
  coinDecimals: 6,
  coinImageUrl: "https://example.com/osmo.svg",
};
const ion = {
  coinDenom: "ION",
  coinMinimalDenom: "uion",
  coinDecimals: 6,
};
const chain: ChainInfo = {
  chainId: "osmosis-1",
  chainName: "Osmosis",
  rpc: "https://custom-rpc.example",
  rest: "https://custom-rest.example",
  bip44: { coinType: 118 },
  currencies: [osmo, ion],
  stakeCurrency: osmo,
  feeCurrencies: [
    { ...osmo, gasPriceStep: { low: 0.01, average: 0.03, high: 0.04 } },
  ],
  features: ["ibc-transfer", "cosmwasm"],
};

it("registers received swap assets without visiting the Swap page", () => {
  const loaded = withOsmosisSwapCurrencies(chain);
  for (const token of OSMOSIS_SWAP_TOKENS) {
    expect(
      loaded.currencies.find(
        (currency) => currency.coinMinimalDenom === token.coinMinimalDenom
      )
    ).toMatchObject(token);
  }
  expect(loaded.currencies).toHaveLength(5);
  expect(
    loaded.currencies.find((currency) => currency.coinMinimalDenom === "uion")
  ).toBe(ion);
  expect(
    loaded.currencies.find((currency) => currency.coinMinimalDenom === "uosmo")
  ).toMatchObject({ coinImageUrl: osmo.coinImageUrl });
  expect(chain.currencies).toEqual([osmo, ion]);
  expect(pageTokens).toBe(OSMOSIS_SWAP_TOKENS);
});

it("keeps custom endpoints, fee policy and unrelated chain metadata intact", () => {
  const loaded = withOsmosisSwapCurrencies(chain);
  expect(loaded.rpc).toBe(chain.rpc);
  expect(loaded.rest).toBe(chain.rest);
  expect(loaded.bip44).toBe(chain.bip44);
  expect(loaded.features).toBe(chain.features);
  expect(loaded.stakeCurrency).toBe(chain.stakeCurrency);
  expect(loaded.feeCurrencies).toBe(chain.feeCurrencies);
  expect(loaded.feeCurrencies).toHaveLength(1);
});

it("restores exact verified metadata and deduplicates currencies across repeated loads", () => {
  const usdc = OSMOSIS_SWAP_TOKENS[1];
  const stale = {
    ...usdc,
    coinDecimals: 18,
    coinDenom: "Old USDC label",
    coinGeckoId: "old-price-id",
    coinImageUrl: "https://example.com/usdc.svg",
  };
  const first = withOsmosisSwapCurrencies({
    ...chain,
    currencies: [...chain.currencies, stale, stale, osmo],
  });
  const second = withOsmosisSwapCurrencies(first);
  expect(second).toEqual(first);
  expect(second.currencies).toHaveLength(5);
  expect(
    second.currencies.find(
      (currency) => currency.coinMinimalDenom === usdc.coinMinimalDenom
    )
  ).toEqual({ ...stale, ...usdc });
  expect(stale.coinDecimals).toBe(18);
});

it("restores missing currencies after a fresh restart or stale registry response", () => {
  const first = withOsmosisSwapCurrencies(chain);
  const restarted = withOsmosisSwapCurrencies({
    ...chain,
    currencies: [osmo, ion],
  });
  const refreshed = withOsmosisSwapCurrencies({
    ...first,
    currencies: [osmo, ion],
    rest: "https://updated-custom-rest.example",
  });
  expect(restarted.currencies).toEqual(first.currencies);
  expect(refreshed.currencies).toEqual(first.currencies);
  expect(refreshed.rest).toBe("https://updated-custom-rest.example");
});

it("applies the same metadata to modular Cosmos chains from the background", () => {
  const modular = {
    isV2: true as const,
    type: "cosmos" as const,
    chainId: chain.chainId,
    chainName: chain.chainName,
    cosmos: chain,
    linkedChainKey: "custom-group",
  };
  const loaded = withOsmosisSwapCurrencies(modular);
  expect(loaded.cosmos.currencies).toEqual(
    withOsmosisSwapCurrencies(chain).currencies
  );
  expect(loaded.cosmos.feeCurrencies).toBe(chain.feeCurrencies);
  expect(loaded.linkedChainKey).toBe("custom-group");
  expect(modular.cosmos.currencies).toEqual([osmo, ion]);
  expect(withOsmosisSwapCurrencies(loaded)).toEqual(loaded);
});

it("leaves other chain IDs, testnets and non-Cosmos modules untouched", () => {
  const modular = {
    isV2: true as const,
    type: "cosmos" as const,
    chainId: chain.chainId,
    chainName: chain.chainName,
    cosmos: chain,
  };
  const unrelated: (ChainInfo | ModularChainInfo)[] = [
    { ...chain, chainId: "osmosis-2" },
    { ...chain, chainId: "osmo-test-5" },
    { ...chain, chainId: "epix_1916-1" },
    { ...chain, isTestnet: true },
    { ...modular, isTestnet: true },
    { ...modular, cosmos: { ...chain, isTestnet: true } },
    {
      isV2: true,
      type: "evm",
      chainId: chain.chainId,
      chainName: chain.chainName,
      evm: { chainId: 1, rpc: chain.rpc, nativeCurrency: osmo, tokens: [] },
    },
  ];
  for (const other of unrelated) {
    expect(withOsmosisSwapCurrencies(other)).toBe(other);
  }
});
