import { OsmosisQueriesImpl } from "@keplr-wallet/stores";
import { Dec } from "@keplr-wallet/unit";
import { calculateSwapNetworkFee } from "./swap";

const feeLifetimeMs = 30_000;
const feeUnavailableMessage = "Network fee unavailable. Refresh and try again.";
type FeeQueries = Pick<
  OsmosisQueriesImpl,
  | "queryBaseFee"
  | "queryTxFeesBaseDenom"
  | "queryTxFeesFeeTokens"
  | "queryTxFeesSpotPriceByDenom"
>;
type FreshQuery = {
  readonly error?: unknown;
  waitFreshResponse(): Promise<
    { timestamp: number; staled?: boolean } | undefined
  >;
};

async function waitForFeeResponse(query: FreshQuery, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Fee preparation cancelled.");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortWait!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    abortWait = () => reject(new Error(feeUnavailableMessage));
    timeout = setTimeout(abortWait, 10_000);
    signal?.addEventListener("abort", abortWait, { once: true });
  });
  try {
    // Stop this caller's wait without cancelling a query shared with other views.
    return await Promise.race([query.waitFreshResponse(), interrupted]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortWait);
  }
}

async function refreshFeeQuery(
  query: FreshQuery,
  signal?: AbortSignal
): Promise<number> {
  const response = await waitForFeeResponse(query, signal);
  const now = Date.now();
  if (
    signal?.aborted ||
    query.error ||
    !response ||
    response.staled ||
    !Number.isFinite(response.timestamp) ||
    response.timestamp > now + 1000 ||
    response.timestamp + feeLifetimeMs <= now
  ) {
    throw new Error(feeUnavailableMessage);
  }
  return response.timestamp + feeLifetimeMs;
}

/** Use Osmosis's live fee-token allowlist and its base-unit spot conversion. */
export async function getOsmosisFeeQuote({
  queries,
  feeDenom,
  gasUsed,
  minimumGasPrice,
  signal,
}: {
  queries: FeeQueries;
  feeDenom: string;
  gasUsed: number;
  minimumGasPrice: Dec;
  signal?: AbortSignal;
}) {
  const expiries = await Promise.all([
    refreshFeeQuery(queries.queryBaseFee, signal),
    refreshFeeQuery(queries.queryTxFeesBaseDenom, signal),
  ]);
  const baseFee = queries.queryBaseFee.baseFee;
  if (
    queries.queryTxFeesBaseDenom.baseDenom !== "uosmo" ||
    !baseFee?.gt(new Dec(0)) ||
    minimumGasPrice.lt(new Dec(0))
  ) {
    throw new Error(feeUnavailableMessage);
  }
  const bufferedBaseFee = baseFee.mul(new Dec("1.2"));
  let gasPrice = bufferedBaseFee.gt(minimumGasPrice)
    ? bufferedBaseFee
    : minimumGasPrice;
  if (feeDenom !== "uosmo") {
    expiries.push(await refreshFeeQuery(queries.queryTxFeesFeeTokens, signal));
    if (!queries.queryTxFeesFeeTokens.isTxFeeToken(feeDenom)) {
      throw new Error("Osmosis does not currently accept this asset for fees.");
    }
    const spot = queries.queryTxFeesSpotPriceByDenom.getQueryDenom(feeDenom);
    expiries.push(await refreshFeeQuery(spot, signal));
    if (!spot.spotPriceDec.gt(new Dec(0))) {
      throw new Error(
        "Fee-token conversion unavailable. Refresh and try again."
      );
    }
    // Match the existing fee configuration's 1% conversion allowance. The
    // spot price is in base units, so token decimals must not be applied again.
    gasPrice = gasPrice.quo(spot.spotPriceDec).mul(new Dec("1.01"));
  }
  const expiresAt = Math.min(...expiries);
  if (signal?.aborted || expiresAt <= Date.now()) {
    throw new Error("Network fee expired. Refresh and try again.");
  }
  return {
    fee: calculateSwapNetworkFee(gasUsed, gasPrice, feeDenom),
    gasPrice,
    expiresAt,
  };
}
