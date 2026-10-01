import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { Dec } from "@keplr-wallet/unit";

export const EPIX_PRICE_ID = "epix";
// sha256("transfer/channel-108456/aepix"), matching the Explorer's IBC registry.
export const EPIX_OSMOSIS_DENOM =
  "ibc/776917313EC3252954ED622945D4979651ACD909A18E528283F46D7B166F20BF";
export const EPIX_PRICE_MAX_AGE_MS = 15 * 60 * 1000;
export const EPIX_PRICE_EXPIRY = "__epix_valid_until";
export const OSMOSIS_EPIX_URL = "https://data.app.osmosis.zone/tokens/v2/EPIX";

type PriceData = Record<string, Record<string, number>>;
type JsonResponse = { headers: Headers; data: unknown };
export type PriceFetch = (
  url: string,
  signal: AbortSignal
) => Promise<JsonResponse>;

const fetchPrice: PriceFetch = (url, signal) =>
  simpleFetch<unknown>(url, { signal });

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positive(value: unknown): value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 1e-18 ||
    value > Number.MAX_SAFE_INTEGER
  )
    return false;
  try {
    return new Dec(value.toString()).gt(new Dec(0));
  } catch {
    return false;
  }
}

function fresh(timestamp: number, now: number): boolean {
  return (
    Number.isFinite(timestamp) &&
    timestamp <= now + 60_000 &&
    timestamp > now - EPIX_PRICE_MAX_AGE_MS
  );
}

type Quote = { price: number; timestamp: number };

function osmosisQuote(response: JsonResponse, now: number): Quote | undefined {
  if (!Array.isArray(response.data)) return;
  const token = response.data.find(
    (token: unknown) =>
      record(token) &&
      token["denom"] === EPIX_OSMOSIS_DENOM &&
      token["exponent"] === 18 &&
      token["coingecko_id"] === EPIX_PRICE_ID
  );
  if (!record(token) || !positive(token["price"])) return;

  // This endpoint has no trade timestamp. Date/Age bound the age of its current
  // API snapshot, without downloading thousands of historical candles.
  const date = Date.parse(response.headers.get("date") ?? "");
  const age = response.headers.get("age");
  if (age !== null && !/^\d+$/.test(age)) return;
  const timestamp = Math.min(date, now - Number(age ?? 0) * 1000);
  if (!fresh(date, now) || !fresh(timestamp, now)) return;
  return { price: token["price"], timestamp };
}

export function resolveEpixPrices(
  coinGecko: JsonResponse | undefined,
  osmosis: JsonResponse | undefined,
  currencies: readonly string[],
  now: number
): Record<string, number> {
  const result: Record<string, number> = {};
  const cgData = coinGecko?.data;
  const source = record(cgData) ? cgData[EPIX_PRICE_ID] : undefined;
  const cg = record(source) ? source : undefined;
  const cgTimestamp =
    typeof cg?.["last_updated_at"] === "number"
      ? cg["last_updated_at"] * 1000
      : NaN;
  const validCg = fresh(cgTimestamp, now);
  const osmo = osmosis ? osmosisQuote(osmosis, now) : undefined;
  const timestamps: number[] = [];

  for (const currency of currencies) {
    const value = cg?.[currency];
    const cgPrice = validCg && positive(value) ? value : undefined;
    if (currency !== "usd") {
      // Osmosis only quotes USD. Never relabel that price as another currency.
      if (cgPrice !== undefined) {
        result[currency] = cgPrice;
        timestamps.push(cgTimestamp);
      }
      continue;
    }
    if (cgPrice !== undefined && osmo) {
      const lower = new Dec(Math.min(cgPrice, osmo.price).toString());
      const higher = new Dec(Math.max(cgPrice, osmo.price).toString());
      // Average only matching USD snapshots within 20% of the lower quote.
      // A larger disagreement means unavailable, not a misleading midpoint.
      if (higher.gt(lower.mul(new Dec("1.2")))) continue;
      result["usd"] = Number(lower.add(higher).quo(new Dec(2)).toString());
      timestamps.push(cgTimestamp, osmo.timestamp);
    } else if (cgPrice !== undefined) {
      result["usd"] = cgPrice;
      timestamps.push(cgTimestamp);
    } else if (osmo) {
      result["usd"] = osmo.price;
      timestamps.push(osmo.timestamp);
    }
  }
  if (timestamps.length) {
    result[EPIX_PRICE_EXPIRY] = Math.min(...timestamps) + EPIX_PRICE_MAX_AGE_MS;
  }
  return result;
}

async function boundedFetch(
  fetch: PriceFetch,
  url: string,
  signal: AbortSignal
): Promise<JsonResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 8_000);
  try {
    return await fetch(url, controller.signal);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export async function fetchEpixPrices(
  coinGeckoUrl: string,
  signal: AbortSignal,
  fetch: PriceFetch = fetchPrice,
  now: () => number = Date.now
): Promise<{ headers: Headers; data: PriceData }> {
  const url = new URL(coinGeckoUrl);
  url.searchParams.set("include_last_updated_at", "true");
  const currencies = (url.searchParams.get("vs_currencies") ?? "usd").split(
    ","
  );
  const [cgResult, osmoResult] = await Promise.allSettled([
    boundedFetch(fetch, url.toString(), signal),
    boundedFetch(fetch, OSMOSIS_EPIX_URL, signal),
  ]);
  if (signal.aborted) throw new Error("Price request cancelled");
  if (cgResult.status === "rejected" && osmoResult.status === "rejected") {
    throw new Error("Price sources unavailable");
  }
  const cg = cgResult.status === "fulfilled" ? cgResult.value : undefined;
  const osmo = osmoResult.status === "fulfilled" ? osmoResult.value : undefined;
  const epix = resolveEpixPrices(cg, osmo, currencies, now());
  const cgData = cg?.data;
  return {
    headers: cg?.headers ?? osmo?.headers ?? new Headers(),
    data: {
      ...(record(cgData) ? (cgData as PriceData) : {}),
      [EPIX_PRICE_ID]: epix,
    },
  };
}
