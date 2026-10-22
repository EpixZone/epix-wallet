import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useIntl } from "react-intl";
import {
  DSColor,
  DSTypography,
  RefreshIcon,
} from "@keplr-wallet/design-system";
import type { EndpointHealthSnapshot } from "@keplr-wallet/background";

export interface EndpointConnectionStatusProps {
  snapshot: EndpointHealthSnapshot;
  chainName: string;
  compact?: boolean;
  disabled?: boolean;
  hasUnsavedChanges?: boolean;
  onCheck: () => Promise<void>;
  onRecommended?: () => Promise<void>;
  onPublicFallback?: (enabled: boolean) => Promise<void>;
  onSettings?: () => void;
}

export function showEndpointStatusOnHome(
  status: EndpointHealthSnapshot["status"]
): boolean {
  return (
    status === "backup" || status === "degraded" || status === "unavailable"
  );
}

const statusLabels: Record<EndpointHealthSnapshot["status"], string> = {
  unknown: "Connection not checked",
  checking: "Checking connection…",
  healthy: "Connected",
  backup: "Using a backup connection",
  degraded: "Some connections need attention",
  unavailable: "Connection unavailable",
};
const capabilityLabels = { rpc: "RPC", rest: "REST", evmRpc: "EVM RPC" };
const capabilityStatus = {
  unknown: "Not checked",
  healthy: "Connected",
  stale: "Blocks are out of date",
  unavailable: "Not responding",
  "wrong-chain": "Wrong network",
  syncing: "Node is still syncing",
  malformed: "Unexpected response",
};
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "";
  }
}

export function EndpointConnectionStatus({
  snapshot,
  chainName,
  compact = false,
  disabled = false,
  hasUnsavedChanges = false,
  onCheck,
  onRecommended,
  onPublicFallback,
  onSettings,
}: EndpointConnectionStatusProps) {
  const intl = useIntl();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const pendingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const t = (id: string, defaultMessage: string) =>
    intl.formatMessage({ id: `endpoint.connection.${id}`, defaultMessage });
  const run = async (action: () => Promise<void>) => {
    if (pendingRef.current || disabled) return;
    pendingRef.current = true;
    setPending(true);
    setFailed(false);
    try {
      await action();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  };
  if (compact && !showEndpointStatusOnHome(snapshot.status)) return null;
  const busy = disabled || pending || snapshot.status === "checking";
  return (
    <Panel
      aria-label={`${chainName} ${t("title", "connection")}`}
      aria-busy={pending || snapshot.status === "checking"}
    >
      <DSTypography
        as="div"
        size="textSm"
        weight="medium"
        role="status"
        aria-live="polite"
      >
        {chainName}:{" "}
        {pending
          ? t("updating", "Updating connection…")
          : t(snapshot.status, statusLabels[snapshot.status])}
      </DSTypography>
      {!compact && (
        <Capabilities>
          {(["rpc", "rest", "evmRpc"] as const).map((capability) => {
            const health = snapshot.capabilities[capability];
            if (!health) return null;
            return (
              <Capability key={capability}>
                <DSTypography as="dt" size="textXs" weight="medium">
                  {capabilityLabels[capability]}
                </DSTypography>
                <DSTypography
                  as="dd"
                  size="textXs"
                  color={DSColor.typography.primary}
                >
                  {t(
                    `capability.${health.status}`,
                    capabilityStatus[health.status]
                  )}
                  {endpointHost(health.endpoint) && (
                    <span> · {endpointHost(health.endpoint)}</span>
                  )}
                </DSTypography>
              </Capability>
            );
          })}
        </Capabilities>
      )}
      {!compact && snapshot.manual && onPublicFallback && (
        <FallbackLabel>
          <input
            type="checkbox"
            checked={snapshot.publicFallback}
            disabled={busy || hasUnsavedChanges}
            onChange={(event) => {
              const enabled = event.target.checked;
              void run(() => onPublicFallback(enabled));
            }}
          />
          <DSTypography size="textXs">
            {t(
              "allow-public-backup",
              "Allow public backups when this custom connection is unavailable"
            )}
          </DSTypography>
        </FallbackLabel>
      )}
      {!compact && hasUnsavedChanges && (
        <DSTypography as="div" size="textXs" color={DSColor.typography.primary}>
          {t("unsaved", "Save your endpoint changes before checking them.")}
        </DSTypography>
      )}
      <Actions>
        <Action
          type="button"
          disabled={busy || hasUnsavedChanges}
          onClick={() => {
            void run(onCheck);
          }}
        >
          <RefreshIcon size={14} aria-hidden="true" />
          <DSTypography size="textXs">
            {t("check", "Check connection")}
          </DSTypography>
        </Action>
        {!compact && onRecommended && (
          <Action
            type="button"
            disabled={busy}
            onClick={() => {
              void run(onRecommended);
            }}
          >
            <DSTypography size="textXs">
              {t("recommended", "Use recommended connection")}
            </DSTypography>
          </Action>
        )}
        {onSettings && (
          <Action type="button" onClick={onSettings}>
            <DSTypography size="textXs">
              {t("settings", "Connection settings")}
            </DSTypography>
          </Action>
        )}
      </Actions>
      {failed && (
        <DSTypography
          as="div"
          size="textXs"
          role="alert"
          color={DSColor.typography.primary}
        >
          {t("failed", "Could not update the connection. Try again.")}
        </DSTypography>
      )}
    </Panel>
  );
}

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.875rem;
  margin-bottom: 0.75rem;
  border: 1px solid ${DSColor.fill.neutral.high_10};
  border-radius: 0.75rem;
  background: ${DSColor.fill.neutral.low};
  color: ${DSColor.typography.primary};
`;
const Capabilities = styled.dl`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
`;
const Capability = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  dt {
    flex-shrink: 0;
  }
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
`;
const FallbackLabel = styled.label`
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  input {
    accent-color: ${DSColor.fill.brand.strong};
    margin-top: 0.125rem;
  }
`;
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;
const Action = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.5rem;
  border: 0;
  background: ${DSColor.fill.neutral.high_10};
  color: ${DSColor.typography.primary};
  cursor: pointer;
  &:disabled {
    background: ${DSColor.fill.neutral.high_10};
    color: ${DSColor.typography.disabled};
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${DSColor.fill.brand.strong};
    outline-offset: 2px;
  }
`;
