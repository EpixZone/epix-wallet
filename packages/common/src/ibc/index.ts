import { DenomHelper } from "../denom";

export type IBCDenomTraceLike = {
  paths?: {
    portId: string;
    channelId: string;
  }[];
};

const ignoredIBCAssets: Record<string, Set<string>> = {
  "osmosis-1": new Set([
    "ibc/C87E63E4798A43D182B8513F91360363315C602C25B98D1E497A3A6F7AA66473",
  ]),
};

const ignoredIBCTraceFirstHops: Record<
  string,
  {
    portId: string;
    channelId: string;
  }[]
> = {
  "osmosis-1": [
    {
      portId: "transfer",
      channelId: "channel-510",
    },
  ],
};

export function isIgnoredIBCAsset(
  chainId: string,
  coinMinimalDenom: string
): boolean {
  const normalizedCoinMinimalDenom =
    DenomHelper.normalizeDenom(coinMinimalDenom);

  return ignoredIBCAssets[chainId]?.has(normalizedCoinMinimalDenom) ?? false;
}

export function isIgnoredIBCTrace(
  chainId: string,
  denomTrace: IBCDenomTraceLike
): boolean {
  const firstPath = denomTrace.paths?.[0];
  if (!firstPath) {
    return false;
  }

  return (
    ignoredIBCTraceFirstHops[chainId]?.some(
      (path) =>
        path.portId === firstPath.portId &&
        path.channelId === firstPath.channelId
    ) ?? false
  );
}
