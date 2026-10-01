import { Bech32Address } from "@keplr-wallet/cosmos";
import { MsgSwapExactAmountIn } from "@keplr-wallet/proto-types/osmosis/poolmanager/v1beta1/tx";
import {
  OSMOSIS_SWAP_TOKENS,
  SWAP_QUOTE_LIFETIME_MS,
  minimumSwapOutput,
  prepareSwapTx,
  validateSwapQuote,
} from "./swap";

const request = {
  amountIn: "1000000000000000001",
  tokenIn: OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom,
  tokenOut: "uosmo",
};
const response = () => ({
  amount_in: { denom: request.tokenIn, amount: request.amountIn },
  amount_out: "1963",
  route: [
    {
      in_amount: request.amountIn,
      out_amount: "1963",
      pools: [
        {
          id: "18446744073709551615",
          token_out_denom: "factory/osmo1example/allETH",
        },
        { id: 3567, token_out_denom: "uosmo" },
      ],
    },
  ],
});

it("preserves exact input and uint64 pool IDs from a single matching SQS route", () => {
  const quote = validateSwapQuote(response(), request, 1000);
  expect(quote.amountIn).toBe("1000000000000000001");
  expect(quote.routes[0].poolId).toBe("18446744073709551615");
  expect(quote.expiresAt).toBe(1000 + SWAP_QUOTE_LIFETIME_MS);
});

it.each([
  (data: ReturnType<typeof response>) => {
    data.amount_in.amount = "1000000000000000000";
  },
  (data: ReturnType<typeof response>) => {
    data.amount_in.denom = "uatom";
  },
  (data: ReturnType<typeof response>) => {
    data.route[0].out_amount = "2000";
  },
  (data: ReturnType<typeof response>) => {
    data.route[0].in_amount = "1";
  },
  (data: ReturnType<typeof response>) => {
    data.route[0].pools[1].token_out_denom = "uatom";
  },
  (data: ReturnType<typeof response>) => {
    data.route[0].pools[0].id = 9007199254740992;
  },
  (data: ReturnType<typeof response>) => {
    data.route[0].pools[0].id = "18446744073709551616";
  },
  (data: ReturnType<typeof response>) => {
    data.route.push(data.route[0]);
  },
  (data: ReturnType<typeof response>) => {
    data.route[0].pools = [];
  },
])("rejects mismatched, split and unsafe pool quotes", (mutate) => {
  const data = response();
  mutate(data);
  expect(() => validateSwapQuote(data, request)).toThrow();
});

it("calculates minimum received with integer arithmetic and rounds downward", () => {
  expect(minimumSwapOutput("1000000000000000001", 50)).toBe(
    "995000000000000000"
  );
  expect(minimumSwapOutput("1963", 100)).toBe("1943");
  expect(() => minimumSwapOutput("1", 100)).toThrow("too small");
  expect(() => minimumSwapOutput("100", 501)).toThrow();
});

it("builds matching protobuf and Amino messages without signing or broadcasting", () => {
  const makeTx = jest.fn();
  const sender = new Bech32Address(new Uint8Array(20).fill(1)).toBech32("osmo");
  const quote = validateSwapQuote(response(), request, 1000);
  prepareSwapTx(
    { bech32Address: sender, cosmos: { makeTx } },
    quote,
    100,
    1001
  );
  expect(makeTx).toHaveBeenCalledTimes(1);
  const messages = makeTx.mock.calls[0][1];
  expect(messages.protoMsgs[0].typeUrl).toBe(
    "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn"
  );
  const decoded = MsgSwapExactAmountIn.decode(messages.protoMsgs[0].value);
  expect(decoded).toEqual({
    sender,
    routes: quote.routes,
    tokenIn: { denom: request.tokenIn, amount: request.amountIn },
    tokenOutMinAmount: "1943",
  });
  expect(messages.aminoMsgs[0].value.routes[0].pool_id).toBe(
    "18446744073709551615"
  );
  expect(messages.aminoMsgs[0].value.token_out_min_amount).toBe("1943");
});

it("refuses expired quotes and non-Osmosis senders before transaction construction", () => {
  const makeTx = jest.fn();
  const sender = new Bech32Address(new Uint8Array(20).fill(1)).toBech32("epix");
  const quote = validateSwapQuote(response(), request, 1000);
  expect(() =>
    prepareSwapTx(
      { bech32Address: sender, cosmos: { makeTx } },
      quote,
      100,
      quote.expiresAt
    )
  ).toThrow("expired");
  expect(() =>
    prepareSwapTx(
      { bech32Address: sender, cosmos: { makeTx } },
      quote,
      100,
      1001
    )
  ).toThrow();
  expect(makeTx).not.toHaveBeenCalled();
});
