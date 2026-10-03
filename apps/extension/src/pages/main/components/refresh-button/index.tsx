import React, {
  FunctionComponent,
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { useSpringValue, animated, easings } from "@react-spring/web";
import {
  DSColor,
  DSTypography,
  RefreshIcon,
} from "@keplr-wallet/design-system";
import { useIntl } from "react-intl";
import styled from "styled-components";
import { Tooltip } from "../../../../components/tooltip";
import { AutoFetchingAssetsInterval } from "../../../../config.ui";
import { useLocation } from "react-router";
import { refreshWalletBalances } from "./refresh-balances";
import {
  isWalletRefreshRoute,
  startWalletRefresh,
  WalletRefreshEvent,
} from "./refresh-controller";

const WalletRefreshContext = createContext<{
  isLoading: boolean;
  hasError: boolean;
  visible: boolean;
} | null>(null);

// Keep one controller alive across route changes; headers only render its state.
export const WalletRefreshProvider = observer<
  PropsWithChildren<{ enabled: boolean }>
>(({ enabled, children }) => {
  const stores = useStore();
  const { pathname } = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const controller = useRef<ReturnType<typeof startWalletRefresh>>();
  const status = stores.keyRingStore.status;
  const accountId = stores.keyRingStore.selectedKeyInfo?.id;
  const previousAccount = useRef({ status, accountId });

  useEffect(() => {
    setIsLoading(false);
    setHasError(false);
    if (!enabled) return;
    previousAccount.current = {
      status: stores.keyRingStore.status,
      accountId: stores.keyRingStore.selectedKeyInfo?.id,
    };
    const refresh = startWalletRefresh({
      document,
      window,
      intervalMs: AutoFetchingAssetsInterval,
      canRefresh: () => stores.keyRingStore.status === "unlocked",
      refresh: (mode) => refreshWalletBalances(stores, mode === "manual"),
      onStart: (mode) => {
        if (mode === "manual") {
          setHasError(false);
          setIsLoading(true);
        }
      },
      onSettled: (mode) => {
        if (mode === "manual") setIsLoading(false);
      },
      onError: (_error, mode) => {
        if (mode === "manual") {
          setHasError(true);
        }
      },
    });
    controller.current = refresh;
    return () => {
      refresh.dispose();
      controller.current = undefined;
    };
  }, [stores, enabled]);

  // Read the selected account again when a queued refresh runs. Never retain
  // the previous account's addresses in the timer or focus handlers.
  useEffect(() => {
    if (
      previousAccount.current.status !== status ||
      previousAccount.current.accountId !== accountId
    ) {
      previousAccount.current = { status, accountId };
      void controller.current?.refresh();
    }
  }, [status, accountId]);

  const value = useMemo(
    () =>
      enabled && status === "unlocked"
        ? { isLoading, hasError, visible: isWalletRefreshRoute(pathname) }
        : null,
    [enabled, status, isLoading, hasError, pathname]
  );
  return (
    <WalletRefreshContext.Provider value={value}>
      {children}
    </WalletRefreshContext.Provider>
  );
});

export function useWalletRefreshVisible() {
  const state = useContext(WalletRefreshContext);
  return state?.visible ?? false;
}

const HeaderRefreshButton = styled.button`
  position: relative;
  width: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: ${DSColor.typography.tertiary};
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${DSColor.background.surface.elevated};
  }
  &:focus-visible {
    outline: 2px solid ${DSColor.fill.accent.purple};
    outline-offset: -2px;
  }
  &:disabled {
    cursor: progress;
  }
`;

export const RefreshButton: FunctionComponent = () => {
  const state = useContext(WalletRefreshContext);
  const visible = useWalletRefreshVisible();
  const intl = useIntl();
  const isLoading = state?.isLoading ?? false;
  const rotate = useSpringValue(0, {
    config: { duration: 1250, easing: easings.linear },
  });
  useEffect(() => {
    if (isLoading) {
      rotate.start(360, { from: 0, loop: true });
    } else {
      rotate.stop();
      rotate.set(0);
    }
    return () => {
      rotate.stop();
    };
  }, [rotate, isLoading]);

  if (!visible) return null;
  const label = intl.formatMessage({
    id: isLoading
      ? "wallet.refresh.loading"
      : "wallet.refresh.accessible-label",
  });
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <Tooltip
        content={intl.formatMessage({
          id: isLoading ? "wallet.refresh.loading" : "wallet.refresh.label",
        })}
        allowedPlacements={["bottom"]}
      >
        <HeaderRefreshButton
          type="button"
          aria-label={label}
          aria-busy={isLoading}
          disabled={isLoading}
          onClick={() => window.dispatchEvent(new Event(WalletRefreshEvent))}
        >
          <animated.span
            aria-hidden="true"
            style={{
              display: "flex",
              transform: rotate.to((v) => `rotate(${v}deg)`),
            }}
          >
            <RefreshIcon size={16} />
          </animated.span>
        </HeaderRefreshButton>
      </Tooltip>
      {state?.hasError ? (
        <DSTypography
          as="div"
          size="textSm"
          role="alert"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            width: "min(16rem, calc(100vw - 10rem))",
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            background: DSColor.background.surface.elevated,
            color: DSColor.typography.primary,
          }}
        >
          {intl.formatMessage({ id: "wallet.refresh.error" })}
        </DSTypography>
      ) : null}
    </div>
  );
};
