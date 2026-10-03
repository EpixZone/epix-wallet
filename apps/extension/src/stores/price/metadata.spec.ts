import { ChainInfo, ModularChainInfo } from "@keplr-wallet/types";
import { withEpixPriceMetadata } from "./metadata";

const currency = {
  coinMinimalDenom: "aepix",
  coinDenom: "EPIX",
  coinDecimals: 18,
};
const chain = {
  chainId: "epix_1916-1",
  chainName: "Epix",
  rpc: "https://custom-rpc.example",
  rest: "https://custom-rest.example",
  bip44: { coinType: 60 },
  currencies: [currency],
  feeCurrencies: [
    { ...currency, gasPriceStep: { low: 1, average: 2, high: 3 } },
  ],
  stakeCurrency: currency,
} as ChainInfo;

it("restores price metadata from old registry data without altering endpoints or fees", () => {
  const fixed = withEpixPriceMetadata(chain);
  expect(fixed.currencies[0].coinGeckoId).toBe("epix");
  expect(fixed.feeCurrencies[0].coinGeckoId).toBe("epix");
  expect(fixed.stakeCurrency?.coinGeckoId).toBe("epix");
  expect(fixed.rpc).toBe(chain.rpc);
  expect(fixed.rest).toBe(chain.rest);
  expect(fixed.feeCurrencies[0].gasPriceStep).toEqual(
    chain.feeCurrencies[0].gasPriceStep
  );
  expect(chain.currencies[0].coinGeckoId).toBeUndefined();
});

it("handles background modular metadata on every update", () => {
  const modular = {
    isV2: true,
    type: "cosmos",
    chainId: chain.chainId,
    chainName: chain.chainName,
    cosmos: chain,
  } as ModularChainInfo;
  const fixed = withEpixPriceMetadata(modular);
  expect(
    fixed.type === "cosmos" && fixed.cosmos.currencies[0].coinGeckoId
  ).toBe("epix");
  const ethermint = {
    ...modular,
    type: "ethermint",
    evm: {
      chainId: 1916,
      rpc: "https://custom-evm.example",
      nativeCurrency: currency,
      tokens: [],
    },
  } as ModularChainInfo;
  const fixedEthermint = withEpixPriceMetadata(ethermint);
  expect(
    fixedEthermint.type === "ethermint" &&
      fixedEthermint.evm.nativeCurrency.coinGeckoId
  ).toBe("epix");
});

it("does not assign Epix prices to other chains, testnets or similarly named tokens", () => {
  for (const other of [
    { ...chain, chainId: "another-1" },
    { ...chain, isTestnet: true },
  ])
    expect(withEpixPriceMetadata(other)).toBe(other);
  const tokens = [
    { ...currency, coinMinimalDenom: "factory/other/EPIX" },
    { ...currency, coinDecimals: 6 },
  ];
  expect(
    withEpixPriceMetadata({ ...chain, currencies: tokens }).currencies
  ).toEqual(tokens);
});
