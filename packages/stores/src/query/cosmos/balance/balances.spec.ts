import { DenomHelper, MemoryKVStore } from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { Dec } from "@keplr-wallet/unit";
import { QuerySharedContext } from "../../../common";
import {
  ChainGetter,
  findERC20CosmosBankBalance,
  getERC20CosmosBankDenom,
} from "../../../chain";
import {
  ObservableQueryCosmosBalanceRegistry,
  ObservableQueryCosmosBalancesImpl,
} from "./balances";

const bech32Address = "inj10alvsy3f0a6vsr7ghjh3rtygrhygavsk45803c";
const usdcCurrency = {
  coinDenom: "USDC",
  coinMinimalDenom: "erc20:0xa00c59ff5a080d2b954d0c75e46e22a0c371235a",
  coinDecimals: 6,
};

function createRegistry(chainId: string, chainType: "cosmos" | "ethermint") {
  return new ObservableQueryCosmosBalanceRegistry(
    new QuerySharedContext(new MemoryKVStore("test"), {
      responseDebounceMs: 10,
    })
  ).getBalanceImpl(
    chainId,
    {
      getModularChain: () =>
        ({
          type: chainType,
          chainIdentifier: ChainIdHelper.parse(chainId).identifier,
          unwrapped: {
            type: chainType,
            cosmos: {
              rest: "https://lcd.injective.example",
            },
          },
        } as any),
      hasModularChain: () => true,
    } satisfies ChainGetter,
    bech32Address,
    usdcCurrency.coinMinimalDenom
  );
}

describe("ObservableQueryCosmosBalanceRegistry", () => {
  test("rejects erc20 denoms on non-ethermint chains", () => {
    expect(createRegistry("injective-1", "cosmos")).toBeUndefined();
  });

  test("rejects erc20 denoms on non-Injective ethermint chains", () => {
    expect(createRegistry("planq_7070-2", "ethermint")).toBeUndefined();
  });

  test.each(["injective-1", "injective-777", "injective-888"])(
    "accepts erc20 denoms on Injective ethermint chains: %s",
    (chainId) => {
      expect(createRegistry(chainId, "ethermint")).toBeDefined();
    }
  );

  test("returns zero when an ethermint erc20 balance is missing", () => {
    const balance = new ObservableQueryCosmosBalancesImpl(
      {
        response: {
          headers: {},
          data: {
            balances: [
              {
                denom: "inj",
                amount: "123000000000000000000",
              },
            ],
          },
        },
      } as any,
      "injective-1",
      {
        getModularChain: () =>
          ({
            forceFindCurrency: () => usdcCurrency,
          } as any),
        hasModularChain: () => true,
      },
      new DenomHelper(usdcCurrency.coinMinimalDenom)
    ).balance;

    expect(balance.toDec().equals(new Dec("0"))).toBe(true);
  });

  test("matches ethermint erc20 balances using normalized denom casing", () => {
    const balance = new ObservableQueryCosmosBalancesImpl(
      {
        response: {
          headers: {},
          data: {
            balances: [
              {
                denom: "erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a",
                amount: "123000000",
              },
            ],
          },
        },
      } as any,
      "injective-1",
      {
        getModularChain: () =>
          ({
            forceFindCurrency: () => usdcCurrency,
          } as any),
        hasModularChain: () => true,
      },
      new DenomHelper(usdcCurrency.coinMinimalDenom)
    ).balance;

    expect(balance.toDec().equals(new Dec("123"))).toBe(true);
  });

  test("preserves the on-chain denom casing for ethermint erc20 bank balances", () => {
    const matchedBalance = findERC20CosmosBankBalance(
      [
        {
          denom: "erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a",
          amount: "123000000",
        },
      ],
      usdcCurrency.coinMinimalDenom
    );

    expect(matchedBalance?.denom).toBe(
      "erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a"
    );
  });

  test("derives the Injective erc20 bank denom without a balance response", () => {
    expect(getERC20CosmosBankDenom(usdcCurrency.coinMinimalDenom)).toBe(
      "erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a"
    );
  });
});
