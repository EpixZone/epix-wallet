import React, { useState } from "react";
import styled, { keyframes } from "styled-components";
import {
  ArrowRightIcon,
  ArrowRouteIcon,
  ChevronDownIcon,
  LoadingIcon,
  DSColor,
  DSTypography,
} from "@keplr-wallet/design-system";
import type { TranslateProgress } from "./main-swap-view";
import { OSMOSIS_ROUTE_INTERMEDIATES, QuoteRouteHop } from "./quote-route";
import { OSMOSIS_SWAP_TOKENS } from "./tokens";
import type { OsmosisAssetMetadata } from "./osmosis-asset-registry";
import type { EpixSwapDirection } from "@keplr-wallet/background";

// Bundled registry icons include pinned source attribution and CC-BY-4.0 terms.
const bundledTokenImages = new Map<string, string>([
  [
    OSMOSIS_SWAP_TOKENS[0].coinMinimalDenom,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../public/assets/logo-256.png"),
  ],
  [
    OSMOSIS_SWAP_TOKENS[6].coinMinimalDenom,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../public/assets/logo-256.png"),
  ],
  [
    OSMOSIS_SWAP_TOKENS[5].coinMinimalDenom,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../public/assets/img/route-usdc.svg"),
  ],
  [
    OSMOSIS_SWAP_TOKENS[2].coinMinimalDenom,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../public/assets/img/route-btc.svg"),
  ],
  [
    OSMOSIS_SWAP_TOKENS[3].coinMinimalDenom,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../public/assets/img/route-osmo.svg"),
  ],
  [
    OSMOSIS_ROUTE_INTERMEDIATES.allETH.denom,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../public/assets/img/ethereum.svg"),
  ],
  [
    OSMOSIS_ROUTE_INTERMEDIATES.allUSDT.denom,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../public/assets/img/route-usdt.svg"),
  ],
  [
    OSMOSIS_ROUTE_INTERMEDIATES.allUSDC.denom,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("../../public/assets/img/route-usdc.svg"),
  ],
]);

/** This row stays mounted across refreshes so the estimate and route never collapse. */
export function SwapQuoteRefreshStatus({
  t,
  refreshing,
  stale,
}: Readonly<{ t: TranslateProgress; refreshing: boolean; stale: boolean }>) {
  let label = "quote-live";
  if (refreshing) label = "quote-updating";
  else if (stale) label = "quote-stale";
  return (
    <RefreshStatus role="status" aria-live="polite">
      <RefreshSpinner $active={refreshing} aria-hidden="true">
        <LoadingIcon size={14} />
      </RefreshSpinner>
      <DSTypography size="textXs" color={DSColor.typography.secondary}>
        {t(label)}
      </DSTypography>
    </RefreshStatus>
  );
}

export function SwapRouteSearch({
  t,
  inputToken = "EPIX",
  outputToken,
}: Readonly<{
  t: TranslateProgress;
  inputToken?: string;
  outputToken?: string;
}>) {
  return (
    <SearchStatus role="status" aria-live="polite">
      <SearchPath aria-hidden="true">
        <DSTypography size="textXs">{inputToken}</DSTypography>
        <SearchTrack>
          <SearchDot />
          <SearchDot />
          <SearchDot />
        </SearchTrack>
        <DSTypography size="textXs">{outputToken}</DSTypography>
      </SearchPath>
      <DSTypography as="p" size="textSm">
        {t("estimating")}
      </DSTypography>
      <DSTypography as="p" size="textXs" color={DSColor.typography.secondary}>
        {t("route-search-detail")}
      </DSTypography>
    </SearchStatus>
  );
}

export function SwapQuoteRoute({
  t,
  routes,
  bridgeComplete = false,
  direction = "to-osmosis",
  swapComplete = false,
}: Readonly<{
  t: TranslateProgress;
  routes: ReadonlyArray<QuoteRouteHop>;
  bridgeComplete?: boolean;
  direction?: EpixSwapDirection;
  swapComplete?: boolean;
}>) {
  if (routes.length === 0 && !swapComplete) return null;
  const returning = direction === "to-epix";
  return (
    <RouteSection aria-label={t("estimated-route")}>
      <RouteDisclosure>
        <RouteSummary>
          <ArrowRouteIcon
            size={18}
            color={DSColor.typography.brand}
            aria-hidden
          />
          <DSTypography as="h2" size="textSm">
            {t("estimated-route")}
          </DSTypography>
          <RouteCount>
            <DSTypography size="textXs" color={DSColor.typography.secondary}>
              {t("route-count")}
            </DSTypography>
          </RouteCount>
          <ChevronDownIcon size={16} aria-hidden />
        </RouteSummary>
        <RouteContent>
          {!returning && (
            <RouteBridge
              t={t}
              direction={direction}
              complete={bridgeComplete}
            />
          )}
          {swapComplete ? (
            <DSTypography
              as="p"
              size="textXs"
              color={DSColor.typography.secondary}
            >
              {t("route-swap-complete")}
            </DSTypography>
          ) : (
            <SwapPools
              t={t}
              routes={routes}
              direction={direction}
              bridgeComplete={bridgeComplete}
            />
          )}
          {returning && (
            <RouteBridge
              t={t}
              direction={direction}
              complete={bridgeComplete}
            />
          )}
          {returning && swapComplete && (
            <DSTypography
              as="p"
              size="textXs"
              color={DSColor.typography.secondary}
            >
              {t("route-return-resume-help")}
            </DSTypography>
          )}
        </RouteContent>
      </RouteDisclosure>
    </RouteSection>
  );
}

function RouteBridge({
  t,
  direction,
  complete,
}: Readonly<{
  t: TranslateProgress;
  direction: EpixSwapDirection;
  complete: boolean;
}>) {
  const returning = direction === "to-epix";
  let label = returning ? "route-bridge-return" : "route-ibc-bridge";
  if (complete) label = "route-ibc-complete";
  return (
    <BridgeRow>
      <DSTypography size="textXs" color={DSColor.typography.secondary}>
        {t(label)}
      </DSTypography>
      <TokenPair>
        <DSTypography size="textXs">
          {returning ? "Osmosis" : "Epix"}
        </DSTypography>
        <ArrowRightIcon size={14} aria-hidden />
        <DSTypography size="textXs">
          {returning ? "Epix" : "Osmosis"}
        </DSTypography>
      </TokenPair>
    </BridgeRow>
  );
}

function SwapPools({
  t,
  routes,
  direction,
  bridgeComplete,
}: Readonly<{
  t: TranslateProgress;
  routes: ReadonlyArray<QuoteRouteHop>;
  direction: EpixSwapDirection;
  bridgeComplete: boolean;
}>) {
  let help = bridgeComplete
    ? "route-resume-preview-help"
    : "route-preview-help";
  if (direction === "to-epix") help = "route-return-help";
  return (
    <React.Fragment>
      <RouteViewport tabIndex={0} role="region" aria-label={t("route-path")}>
        <RoutePath>
          <RouteNode>
            <RouteToken
              label={routes[0].tokenIn}
              denom={routes[0].tokenInDenom}
              metadata={routes[0].tokenInMetadata}
            />
          </RouteNode>
          {routes.map((hop) => (
            <RouteNode
              key={`${hop.poolId}-${hop.tokenInDenom}-${hop.tokenOutDenom}`}
            >
              <RouteToken
                label={hop.tokenOut}
                denom={hop.tokenOutDenom}
                metadata={hop.tokenOutMetadata}
              />
            </RouteNode>
          ))}
        </RoutePath>
      </RouteViewport>
      <PoolDetails>
        <PoolSummary>
          <DSTypography size="textXs" color={DSColor.typography.secondary}>
            {t("route-details")}
          </DSTypography>
          <ChevronDownIcon size={16} aria-hidden />
        </PoolSummary>
        <PoolList>
          {routes.map((hop) => (
            <PoolStep
              key={`${hop.poolId}-${hop.tokenInDenom}-${hop.tokenOutDenom}`}
            >
              <DSTypography
                size="textXs"
                color={DSColor.typography.secondary}
                style={{ overflowWrap: "anywhere" }}
              >
                {t("route-pool", { pool: hop.poolId })}
              </DSTypography>
              <TokenPair>
                <DSTypography size="textXs" title={hop.tokenInDenom}>
                  {hop.tokenIn}
                </DSTypography>
                <ArrowRightIcon size={14} aria-hidden />
                <DSTypography size="textXs" title={hop.tokenOutDenom}>
                  {hop.tokenOut}
                </DSTypography>
              </TokenPair>
            </PoolStep>
          ))}
        </PoolList>
        <DSTypography as="p" size="textXs" color={DSColor.typography.secondary}>
          {t(help)}
        </DSTypography>
      </PoolDetails>
    </React.Fragment>
  );
}

function RouteToken({
  label,
  denom,
  metadata,
}: Readonly<{
  label: string;
  denom: string;
  metadata?: OsmosisAssetMetadata;
}>) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const currency = OSMOSIS_SWAP_TOKENS.find(
    (token) => token.coinMinimalDenom === denom
  );
  const intermediate = Object.values(OSMOSIS_ROUTE_INTERMEDIATES).find(
    (token) => token.denom === denom
  );
  const nodeLabel =
    currency?.coinDenom ?? intermediate?.symbol ?? metadata?.symbol ?? label;
  const bundledImage = bundledTokenImages.get(denom);
  const sources = [
    bundledImage,
    metadata?.iconUrl,
    currency?.coinImageUrl,
  ].filter((source): source is string => !!source);
  const src = sources.find((source) => !failedSources.includes(source));
  const fallback = (currency?.coinDenom ?? nodeLabel).slice(0, 2).toUpperCase();
  return (
    <TokenNode>
      <TokenMark aria-hidden="true">
        {src ? (
          <TokenImage
            src={src}
            alt=""
            $monochrome={
              denom === OSMOSIS_ROUTE_INTERMEDIATES.allETH.denom &&
              src === bundledImage
            }
            referrerPolicy="no-referrer"
            onError={() =>
              setFailedSources((previous) => [
                ...previous.filter(
                  (source) => sources.includes(source) && source !== src
                ),
                src,
              ])
            }
          />
        ) : (
          <DSTypography size="textXs" weight="semibold">
            {fallback}
          </DSTypography>
        )}
      </TokenMark>
      <TokenLabel size="textXs" weight="medium" title={denom}>
        {nodeLabel}
      </TokenLabel>
    </TokenNode>
  );
}

const pulse = keyframes`
  0%, 70%, 100% { opacity: 0.3; transform: scale(0.8); }
  35% { opacity: 1; transform: scale(1.25); }
`;
const spin = keyframes`
  to { transform: rotate(360deg); }
`;
const RefreshStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 1.25rem;
`;
const RefreshSpinner = styled.span<{ $active: boolean }>`
  display: inline-flex;
  flex: 0 0 0.875rem;
  width: 0.875rem;
  height: 0.875rem;
  color: ${DSColor.typography.brand};
  visibility: ${({ $active }) => ($active ? "visible" : "hidden")};
  animation: ${spin} 1s linear infinite;
  animation-play-state: ${({ $active }) => ($active ? "running" : "paused")};
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
const SearchStatus = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-block: 0.5rem;
`;
const SearchPath = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: ${DSColor.typography.brand};
  padding-block: 0.5rem;
`;
const SearchTrack = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-around;
  min-width: 3rem;
  position: relative;
  &::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    height: 1px;
    background: ${DSColor.stroke.separator.primary};
  }
`;
const SearchDot = styled.span`
  position: relative;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: ${DSColor.typography.brand};
  animation: ${pulse} 1.6s ease-in-out infinite;
  &:nth-child(2) {
    animation-delay: 0.2s;
  }
  &:nth-child(3) {
    animation-delay: 0.4s;
  }
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
const RouteSection = styled.section`
  min-width: 0;
  max-width: 100%;
  padding-top: 1rem;
  border-top: 1px solid ${DSColor.stroke.separator.primary};
`;
// Native disclosure state stays intact when quote or registry data changes.
const RouteDisclosure = styled.details`
  min-width: 0;
  &[open] > summary > svg:last-child {
    transform: rotate(180deg);
  }
`;
const RouteSummary = styled.summary`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  min-height: 2.75rem;
  cursor: pointer;
  list-style: none;
  color: ${DSColor.typography.primary};
  &::-webkit-details-marker {
    display: none;
  }
  &:focus-visible {
    outline: 2px solid ${DSColor.typography.brand};
    outline-offset: 2px;
    border-radius: 0.25rem;
  }
  > svg {
    flex-shrink: 0;
  }
  h2 {
    margin: 0;
  }
`;
const RouteContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding-top: 0.625rem;
  min-width: 0;
`;
const RouteCount = styled.span`
  margin-left: auto;
`;
const BridgeRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.375rem 0.75rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.5rem;
  background: ${DSColor.fill.neutral.high_10};
`;
const RouteViewport = styled.div`
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-block: 0.5rem;
  border-radius: 0.5rem;
  &:focus-visible {
    outline: 2px solid ${DSColor.typography.brand};
    outline-offset: 2px;
  }
`;
const RoutePath = styled.ol`
  display: flex;
  width: max-content;
  min-width: 100%;
  list-style: none;
  margin: 0;
  padding: 0;
`;
const RouteNode = styled.li`
  position: relative;
  flex: 1 0 6.5rem;
  min-width: 6.5rem;
  &:last-child {
    flex: 0 0 5rem;
    min-width: 5rem;
  }
  &:not(:last-child)::after {
    content: "";
    position: absolute;
    top: 1.25rem;
    left: 4rem;
    right: -1rem;
    border-top: 1px dashed ${DSColor.typography.tertiary};
  }
`;
const TokenNode = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  width: 5rem;
  text-align: center;
  overflow-wrap: anywhere;
`;
const TokenMark = styled.span`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid ${DSColor.stroke.input.default};
  border-radius: 50%;
  overflow: hidden;
  background: ${DSColor.fill.neutral.high_10};
  color: ${DSColor.typography.brand};
`;
const TokenLabel = styled(DSTypography)`
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const TokenImage = styled.img<{ $monochrome: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  object-fit: contain;
  ${({ $monochrome }) =>
    $monochrome &&
    `background: ${DSColor.fill.neutral.strong}; padding: 0.375rem;`}
`;
const PoolDetails = styled.details`
  min-width: 0;
  &[open] > summary > svg {
    transform: rotate(180deg);
  }
  p {
    margin: 0.625rem 0 0;
  }
`;
const PoolSummary = styled.summary`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 2.75rem;
  cursor: pointer;
  list-style: none;
  color: ${DSColor.typography.secondary};
  &::-webkit-details-marker {
    display: none;
  }
  &:focus-visible {
    outline: 2px solid ${DSColor.typography.brand};
    outline-offset: 2px;
    border-radius: 0.25rem;
  }
`;
const PoolList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
`;
const PoolStep = styled.li`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
`;
const TokenPair = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  overflow-wrap: anywhere;
  svg {
    flex-shrink: 0;
  }
`;
