import { ChainInfo, ModularChainInfo } from "@keplr-wallet/types";
import { CoinPretty } from "@keplr-wallet/unit";
import {
  OSMOSIS_ALL_USDC_DENOM,
  OSMOSIS_ALL_USDT_DENOM,
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
  expect(loaded.currencies).toHaveLength(7);
  expect(
    loaded.currencies.find((currency) => currency.coinMinimalDenom === "uion")
  ).toBe(ion);
  expect(
    loaded.currencies.find((currency) => currency.coinMinimalDenom === "uosmo")
  ).toMatchObject({ coinImageUrl: osmo.coinImageUrl });
  expect(chain.currencies).toEqual([osmo, ion]);
  expect(pageTokens).toBe(OSMOSIS_SWAP_TOKENS);
});

it("keeps alloyed output assets distinct from native USDC fee metadata", () => {
  expect(
    OSMOSIS_SWAP_TOKENS.map((token) => [
      token.coinDenom,
      token.coinMinimalDenom,
      token.coinDecimals,
      token.coinGeckoId,
    ])
  ).toEqual([
    [
      "EPIX",
      "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF",
      18,
      "epix",
    ],
    ["USDT", OSMOSIS_ALL_USDT_DENOM, 6, "tether"],
    [
      "BTC",
      "factory/osmo1z6r6qdknhgsc0zeracktgpcxf43j6sekq07nw8sxduc9lg0qjjlqfu25e3/alloyed/allBTC",
      8,
      "bitcoin",
    ],
    ["OSMO", "uosmo", 6, "osmosis"],
    ["USDC", OSMOSIS_ALL_USDC_DENOM, 6, "usd-coin"],
    [
      "USDC",
      "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4",
      6,
      "usd-coin",
    ],
  ]);
});

it.each([
  [OSMOSIS_ALL_USDT_DENOM, "tether"],
  [OSMOSIS_ALL_USDC_DENOM, "usd-coin"],
])(
  "uses six-decimal scaling and the matching price identity for %s",
  (denom, priceId) => {
    const currency = withOsmosisSwapCurrencies(chain).currencies.find(
      (entry) => entry.coinMinimalDenom === denom
    );
    expect(currency).toBeDefined();
    if (!currency) throw new Error("Missing alloyed currency metadata");
    expect(new CoinPretty(currency, "1234567").toDec().toString()).toBe(
      "1.234567000000000000"
    );
    expect(currency.coinGeckoId).toBe(priceId);
  }
);

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

it.each([1, 4, 5])(
  "restores exact metadata for token %i across repeated loads",
  (index) => {
    const token = OSMOSIS_SWAP_TOKENS[index];
    const stale = {
      ...token,
      coinDecimals: 18,
      coinDenom: "Old token label",
      coinGeckoId: "old-price-id",
      coinImageUrl: "https://example.com/usdc.svg",
    };
    const first = withOsmosisSwapCurrencies({
      ...chain,
      currencies: [...chain.currencies, stale, stale, osmo],
    });
    const second = withOsmosisSwapCurrencies(first);
    expect(second).toEqual(first);
    expect(second.currencies).toHaveLength(7);
    expect(
      second.currencies.find(
        (currency) => currency.coinMinimalDenom === token.coinMinimalDenom
      )
    ).toEqual({ ...stale, ...token });
    expect(stale.coinDecimals).toBe(18);
  }
);

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
