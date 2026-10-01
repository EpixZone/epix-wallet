import React from "react";
import styled, { keyframes } from "styled-components";
import {
  ArrowRightIcon,
  ArrowRouteIcon,
  DSColor,
  DSTypography,
} from "@keplr-wallet/design-system";
import type { TranslateProgress } from "./main-swap-view";
import type { QuoteRouteHop } from "./quote-route";

export function SwapRouteSearch({
  t,
  outputToken,
}: Readonly<{ t: TranslateProgress; outputToken?: string }>) {
  return (
    <SearchStatus role="status" aria-live="polite">
      <SearchPath aria-hidden="true">
        <DSTypography size="textXs">EPIX</DSTypography>
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
}: Readonly<{
  t: TranslateProgress;
  routes: ReadonlyArray<QuoteRouteHop>;
  bridgeComplete?: boolean;
}>) {
  if (routes.length === 0) return null;
  return (
    <RouteSection aria-label={t("estimated-route")}>
      <RouteHeading>
        <ArrowRouteIcon
          size={18}
          color={DSColor.typography.brand}
          aria-hidden
        />
        <DSTypography as="h2" size="textSm">
          {t("estimated-route")}
        </DSTypography>
      </RouteHeading>
      <RouteList>
        <RouteStep>
          <DSTypography size="textXs" color={DSColor.typography.secondary}>
            {t(bridgeComplete ? "route-ibc-complete" : "route-ibc-bridge")}
          </DSTypography>
          <TokenPair>
            <DSTypography size="textSm">EPIX · Epix</DSTypography>
            <ArrowRightIcon size={16} aria-hidden />
            <DSTypography size="textSm">EPIX · Osmosis</DSTypography>
          </TokenPair>
        </RouteStep>
        {routes.map((hop) => (
          <RouteStep
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
              <DSTypography size="textSm" title={hop.tokenInDenom}>
                {hop.tokenIn}
              </DSTypography>
              <ArrowRightIcon size={16} aria-hidden />
              <DSTypography size="textSm" title={hop.tokenOutDenom}>
                {hop.tokenOut}
              </DSTypography>
            </TokenPair>
          </RouteStep>
        ))}
      </RouteList>
      <DSTypography as="p" size="textXs" color={DSColor.typography.secondary}>
        {t(bridgeComplete ? "route-resume-preview-help" : "route-preview-help")}
      </DSTypography>
    </RouteSection>
  );
}

const pulse = keyframes`
  0%, 70%, 100% { opacity: 0.3; transform: scale(0.8); }
  35% { opacity: 1; transform: scale(1.25); }
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
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid ${DSColor.stroke.separator.primary};
`;
const RouteHeading = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  h2 {
    margin: 0;
  }
`;
const RouteList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  list-style: none;
  margin: 0;
  padding: 0;
`;
const RouteStep = styled.li`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-left: 0.75rem;
  border-left: 2px solid ${DSColor.stroke.separator.primary};
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
