import { Bech32Address } from "@keplr-wallet/cosmos";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { CosmosAccountImpl, MakeTxResponse } from "@keplr-wallet/stores";
import { Dec } from "@keplr-wallet/unit";
import { Currency } from "@keplr-wallet/types";
import { MsgSwapExactAmountIn } from "@keplr-wallet/proto-types/osmosis/poolmanager/v1beta1/tx";
import { EPIX_OSMOSIS_DENOM } from "../../stores/price/epix";

export const SWAP_QUOTE_LIFETIME_MS = 30_000;
export const OSMOSIS_SWAP_TOKENS: readonly Currency[] = [
  {
    coinDenom: "EPIX",
    coinMinimalDenom: EPIX_OSMOSIS_DENOM,
    coinDecimals: 18,
    coinGeckoId: "epix",
  },
  {
    coinDenom: "USDC",
    coinMinimalDenom:
      "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4",
    coinDecimals: 6,
    coinGeckoId: "usd-coin",
  },
  {
    coinDenom: "BTC",
    coinMinimalDenom:
      "factory/osmo1z6r6qdknhgsc0zeracktgpcxf43j6sekq07nw8sxduc9lg0qjjlqfu25e3/alloyed/allBTC",
    coinDecimals: 8,
    coinGeckoId: "bitcoin",
  },
  {
    coinDenom: "OSMO",
    coinMinimalDenom: "uosmo",
    coinDecimals: 6,
    coinGeckoId: "osmosis",
  },
];

type QuoteRequest = { amountIn: string; tokenIn: string; tokenOut: string };
export type SwapQuote = QuoteRequest & {
  amountOut: string;
  routes: { poolId: string; tokenOutDenom: string }[];
  expiresAt: number;
};
const uint256Max = (BigInt(1) << BigInt(256)) - BigInt(1);
const uint64Max = (BigInt(1) << BigInt(64)) - BigInt(1);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integer(value: unknown, maximum = uint256Max): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    /^[1-9][0-9]{0,77}$/.test(value) &&
    BigInt(value) <= maximum
  );
}
function poolId(value: unknown): string {
  const text =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value;
  if (!integer(text, uint64Max)) throw new TypeError("Invalid swap pool");
  return text;
}
function denom(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    /^[A-Za-z][A-Za-z0-9/:._-]{2,255}$/.test(value)
  );
}

export function validateSwapQuote(
  data: unknown,
  request: QuoteRequest,
  now = Date.now()
): SwapQuote {
  if (
    !integer(request.amountIn) ||
    !denom(request.tokenIn) ||
    !denom(request.tokenOut) ||
    request.tokenIn === request.tokenOut
  )
    throw new TypeError("Invalid swap amount or token");
  if (record(data) && data["amount_out"] === "0")
    throw new RangeError("Swap amount is too small");
  if (
    !record(data) ||
    !record(data["amount_in"]) ||
    data["amount_in"]["amount"] !== request.amountIn ||
    data["amount_in"]["denom"] !== request.tokenIn ||
    !integer(data["amount_out"])
  )
    throw new Error("Quote does not match this swap");
  const routes = data["route"];
  // A split quote cannot safely be encoded as a single exact-input message.
  if (!Array.isArray(routes) || routes.length !== 1)
    throw new Error("Split swap routes are not supported");
  const route: unknown = routes[0];
  if (
    !record(route) ||
    route["in_amount"] !== request.amountIn ||
    route["out_amount"] !== data["amount_out"] ||
    !Array.isArray(route["pools"]) ||
    route["pools"].length === 0 ||
    route["pools"].length > 8
  )
    throw new TypeError("Invalid swap route");
  const pools = route["pools"].map((pool: unknown) => {
    if (!record(pool) || !denom(pool["token_out_denom"]))
      throw new TypeError("Invalid swap route token");
    return {
      poolId: poolId(pool["id"]),
      tokenOutDenom: pool["token_out_denom"],
    };
  });
  if (pools.at(-1)?.tokenOutDenom !== request.tokenOut)
    throw new Error("Quote output token does not match");
  return {
    ...request,
    amountOut: data["amount_out"],
    routes: pools,
    expiresAt: now + SWAP_QUOTE_LIFETIME_MS,
  };
}

export async function fetchSwapQuote(
  request: QuoteRequest,
  signal: AbortSignal
): Promise<SwapQuote> {
  const params = new URLSearchParams({
    tokenIn: request.amountIn + request.tokenIn,
    tokenOutDenom: request.tokenOut,
    singleRoute: "true",
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 15_000);
  try {
    const { data } = await simpleFetch<unknown>(
      `https://sqs.osmosis.zone/router/quote?${params}`,
      { signal: controller.signal }
    );
    return validateSwapQuote(data, request);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export function minimumSwapOutput(
  amountOut: string,
  slippageBps: number
): string {
  if (
    !integer(amountOut) ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 1 ||
    slippageBps > 500
  )
    throw new TypeError("Invalid slippage tolerance");
  const minimum =
    (BigInt(amountOut) * BigInt(10_000 - slippageBps)) / BigInt(10_000);
  if (minimum <= BigInt(0)) throw new Error("Swap amount is too small");
  return minimum.toString();
}

export function prepareSwapTx(
  account: { bech32Address: string; cosmos: Pick<CosmosAccountImpl, "makeTx"> },
  quote: SwapQuote,
  slippageBps: number,
  now = Date.now()
): MakeTxResponse {
  if (quote.expiresAt <= now)
    throw new Error("Swap quote expired. Request a new quote.");
  Bech32Address.validate(account.bech32Address, "osmo");
  const message = {
    sender: account.bech32Address,
    routes: quote.routes,
    tokenIn: { denom: quote.tokenIn, amount: quote.amountIn },
    tokenOutMinAmount: minimumSwapOutput(quote.amountOut, slippageBps),
  };
  return account.cosmos.makeTx("swap", {
    protoMsgs: [
      {
        typeUrl: "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn",
        value: MsgSwapExactAmountIn.encode(message).finish(),
      },
    ],
    aminoMsgs: [
      {
        type: "osmosis/poolmanager/swap-exact-amount-in",
        value: {
          sender: message.sender,
          routes: message.routes.map((route) => ({
            pool_id: route.poolId,
            token_out_denom: route.tokenOutDenom,
          })),
          token_in: message.tokenIn,
          token_out_min_amount: message.tokenOutMinAmount,
        },
      },
    ],
  });
}

export function calculateSwapNetworkFee(
  gasUsed: number,
  gasPrice: Dec,
  denom: string
) {
  if (
    !Number.isSafeInteger(gasUsed) ||
    gasUsed <= 0 ||
    gasUsed > 50_000_000 ||
    !gasPrice.gt(new Dec(0))
  )
    throw new TypeError("Network fee unavailable");
  const gas = Math.ceil(gasUsed * 1.3);
  return {
    gas: String(gas),
    amount: [
      { denom, amount: gasPrice.mul(new Dec(gas)).roundUp().toString() },
    ],
  };
}
