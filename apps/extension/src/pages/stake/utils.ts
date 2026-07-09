import { IntlShape } from "react-intl";
import { IModularChainInfoImpl } from "@keplr-wallet/stores";

// A chain can be staked natively from the wallet when it exposes the cosmos
// staking module (stake currency + bech32 validator addresses). This replaces
// the old `walletUrlForStaking` link-out gate.
export function supportsNativeStaking(
  modularChainInfo: IModularChainInfoImpl
): boolean {
  const u = modularChainInfo.unwrapped;
  return (
    (u.type === "cosmos" || u.type === "ethermint") &&
    !!u.cosmos.stakeCurrency &&
    !!u.cosmos.bech32Config
  );
}

function parseTimeToMs(time: string | number): number {
  if (typeof time === "number") {
    return time;
  }

  const parsed = Number(time);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return new Date(time).getTime();
}

export function formatRelativeTime(time: string | number): {
  unit: "minute" | "hour" | "day";
  value: number;
} {
  const timeMs = parseTimeToMs(time);

  const remaining = timeMs - Date.now();

  if (remaining <= 0) {
    return {
      unit: "minute",
      value: 1,
    };
  }

  const remainingSeconds = remaining / 1000;
  const remainingMinutes = remainingSeconds / 60;
  if (remainingMinutes < 1) {
    return {
      unit: "minute",
      value: 1,
    };
  }

  const remainingHours = remainingMinutes / 60;
  const remainingDays = remainingHours / 24;

  if (remainingDays >= 1) {
    return {
      unit: "day",
      value: Math.ceil(remainingDays),
    };
  }

  if (remainingHours >= 1) {
    return {
      unit: "hour",
      value: Math.ceil(remainingHours),
    };
  }

  return {
    unit: "minute",
    value: Math.ceil(remainingMinutes),
  };
}

export function formatRelativeTimeString(
  intl: IntlShape,
  time: string | number
): string {
  const relativeTime = formatRelativeTime(time);
  return intl.formatRelativeTime(relativeTime.value, relativeTime.unit);
}
