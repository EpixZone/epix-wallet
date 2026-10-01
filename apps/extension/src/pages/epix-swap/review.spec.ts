import { CoinPretty } from "@keplr-wallet/unit";
import { prepareReview } from "./review";
import { prepareEpixBridgeTx } from "./bridge";
import { getOsmosisFeeQuote } from "./fee";
import { OSMOSIS_SWAP_TOKENS } from "./swap";

jest.mock("./bridge", () => ({
  ...jest.requireActual("./bridge"),
  prepareEpixBridgeTx: jest.fn(),
}));
jest.mock("./fee", () => ({ getOsmosisFeeQuote: jest.fn() }));

it("uses OSMO base gas-price metadata when reviewing an alternative-token fee", async () => {
  const tx = { simulate: jest.fn().mockResolvedValue({ gasUsed: 100000 }) };
  (prepareEpixBridgeTx as jest.Mock).mockResolvedValue(tx);
  (getOsmosisFeeQuote as jest.Mock).mockResolvedValue({
    fee: {
      gas: "130000",
      amount: [
        { denom: OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom, amount: "100" },
      ],
    },
    expiresAt: Date.now() + 30000,
  });
  const balance = (index: number) => ({
    balance: new CoinPretty(
      OSMOSIS_SWAP_TOKENS[index],
      "100000000000000000000"
    ),
    waitFreshResponse: jest.fn().mockResolvedValue(undefined),
  });
  const input = {
    stage: "withdraw",
    amount: "1",
    slippage: 100,
    sourceCurrency: OSMOSIS_SWAP_TOKENS[0],
    targetCurrency: OSMOSIS_SWAP_TOKENS[0],
    feeCurrency: OSMOSIS_SWAP_TOKENS[1],
    sourceAccount: {
      isReadyToSendTx: true,
      bech32Address: "osmo-test",
      cosmos: {},
    },
    targetAccount: {
      isReadyToSendTx: true,
      bech32Address: "epix-test",
      cosmos: {},
    },
    epixChain: { rest: "https://epix.test", feeCurrencies: [] },
    osmoChain: {
      rest: "https://osmosis.test",
      feeCurrencies: [
        { ...OSMOSIS_SWAP_TOKENS[3], gasPriceStep: { average: 0.025 } },
        { ...OSMOSIS_SWAP_TOKENS[1], gasPriceStep: { average: 999 } },
      ],
    },
    balanceQuery: balance(0),
    feeQuery: balance(1),
    targetQuery: balance(0),
    feeQueries: {},
    signal: new AbortController().signal,
    messages: {
      loading: "loading",
      insufficient: "insufficient",
      noFeeBalance: "no fee",
    },
  } as unknown as Parameters<typeof prepareReview>[0];
  const review = await prepareReview(input);
  expect(getOsmosisFeeQuote).toHaveBeenCalledTimes(1);
  const options = (getOsmosisFeeQuote as jest.Mock).mock.calls[0][0];
  expect(options.minimumGasPrice.toString()).toBe("0.025000000000000000");
  expect(options.feeDenom).toBe(OSMOSIS_SWAP_TOKENS[1].coinMinimalDenom);
  expect(review.tx).toBe(tx);
  expect(tx.simulate).toHaveBeenCalledTimes(1);
});
