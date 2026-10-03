import type { IObservableQueryBalanceImpl } from "@keplr-wallet/stores";
import { CoinPretty } from "@keplr-wallet/unit";

type BalanceQuery = Pick<
  IObservableQueryBalanceImpl,
  "currency" | "response" | "error" | "isFetching"
>;

export type SwapBalanceView =
  | { status: "loading" | "error"; amount?: undefined }
  | { status: "ready"; amount: string };

const uint256Max = (BigInt(1) << BigInt(256)) - BigInt(1);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validCoin(value: unknown): value is { denom: string; amount: string } {
  return (
    record(value) &&
    typeof value["denom"] === "string" &&
    value["denom"].length > 0 &&
    typeof value["amount"] === "string" &&
    /^(?:0|[1-9]\d{0,77})$/.test(value["amount"]) &&
    BigInt(value["amount"]) <= uint256Max
  );
}

function completePage(pagination: unknown): boolean {
  if (pagination === undefined || pagination === null) return true;
  if (!record(pagination)) return false;
  const next = pagination["next_key"];
  return next === undefined || next === null || next === "";
}

function bankAmount(data: unknown, denom: string): string | undefined {
  if (!record(data) || !Array.isArray(data["balances"])) return undefined;
  const coins: unknown[] = data["balances"];
  if (coins.length > 1000 || !coins.every(validCoin)) return undefined;
  const matching = coins.filter((coin) => coin.denom === denom);
  if (matching.length > 1) return undefined;
  if (matching.length === 1) return matching[0].amount;
  return completePage(data["pagination"]) ? "0" : undefined;
}

/** Cosmos bank omits zero holdings; CoinPretty.isReady alone cannot distinguish them. */
export function swapBalanceView(query?: BalanceQuery): SwapBalanceView {
  if (!query) return { status: "loading" };
  const response = query.response;
  const fetching = query.isFetching;
  if (query.error) return { status: fetching ? "loading" : "error" };
  if (!response) return { status: "loading" };
  const amount = bankAmount(response.data, query.currency.coinMinimalDenom);
  if (amount === undefined) return { status: "error" };
  return {
    status: "ready",
    amount: new CoinPretty(query.currency, amount)
      .maxDecimals(query.currency.coinDecimals)
      .trim(true)
      .toString(),
  };
}
