import { canSelectAssetForIBCTransfer } from "./utils";

const makeChainInfo = (type: string, features?: string[]) => ({
  unwrapped: {
    type,
    cosmos: {
      features,
    },
  },
});

describe("canSelectAssetForIBCTransfer", () => {
  test("allows native denoms on IBC-enabled Cosmos chains", () => {
    expect(
      canSelectAssetForIBCTransfer(
        makeChainInfo("cosmos", ["ibc-transfer"]),
        "uatom"
      )
    ).toBe(true);
  });

  test("allows IBC voucher denoms because they are bank denoms", () => {
    expect(
      canSelectAssetForIBCTransfer(
        makeChainInfo("cosmos", ["ibc-transfer"]),
        "ibc/1234567890ABCDEF"
      )
    ).toBe(true);
  });

  test("allows native denoms on IBC-enabled Ethermint chains", () => {
    expect(
      canSelectAssetForIBCTransfer(
        makeChainInfo("ethermint", ["ibc-transfer"]),
        "inj"
      )
    ).toBe(true);
  });

  test("rejects Injective MTS ERC20 bank assets such as native USDC", () => {
    expect(
      canSelectAssetForIBCTransfer(
        makeChainInfo("ethermint", ["ibc-transfer"]),
        "erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a"
      )
    ).toBe(false);
  });

  test("rejects non-IBC chains and non-Cosmos chain types", () => {
    expect(canSelectAssetForIBCTransfer(makeChainInfo("cosmos"), "uatom")).toBe(
      false
    );
    expect(
      canSelectAssetForIBCTransfer(
        makeChainInfo("evm", ["ibc-transfer"]),
        "ethereum-native"
      )
    ).toBe(false);
  });
});
