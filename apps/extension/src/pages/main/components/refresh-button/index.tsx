import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { useSpringValue, animated, easings } from "@react-spring/web";
import { SidePanelMaxWidth } from "../../../../styles";
import {
  DSColor,
  DSTypography,
  LoadingIcon,
} from "@keplr-wallet/design-system";
import { useIntl } from "react-intl";
import { Gutter } from "../../../../components/gutter";
import { BottomTabsHeightRem } from "../../../../bottom-tabs";
import { AutoFetchingAssetsInterval } from "../../../../config.ui";
import { useLocation } from "react-router";
import { refreshWalletBalances } from "./refresh-balances";
import {
  isWalletRefreshRoute,
  startWalletRefresh,
  WalletRefreshEvent,
} from "./refresh-controller";

export const RefreshButton: FunctionComponent = observer(() => {
  const stores = useStore();
  const intl = useIntl();
  const { pathname } = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const controller = useRef<ReturnType<typeof startWalletRefresh>>();
  const status = stores.keyRingStore.status;
  const accountId = stores.keyRingStore.selectedKeyInfo?.id;
  const previousAccount = useRef({ status, accountId });

  useEffect(() => {
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
  }, [stores]);

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

  if (status !== "unlocked" || !isWalletRefreshRoute(pathname)) return null;

  return (
    <div
      style={{
        pointerEvents: "none",
        position: "fixed",
        marginBottom: BottomTabsHeightRem,
        bottom: "0.75rem",
        zIndex: 10,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: SidePanelMaxWidth,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      {hasError ? (
        <DSTypography
          as="div"
          size="textSm"
          role="alert"
          style={{
            padding: "0.5rem 1rem",
            maxWidth: "90%",
            borderRadius: "0.5rem",
            background: DSColor.background.surface.elevated,
            color: DSColor.typography.primary,
          }}
        >
          {intl.formatMessage({ id: "wallet.refresh.error" })}
        </DSTypography>
      ) : null}
      <button
        type="button"
        aria-label={intl.formatMessage({
          id: "wallet.refresh.accessible-label",
        })}
        aria-busy={isLoading}
        disabled={isLoading}
        onClick={() => window.dispatchEvent(new Event(WalletRefreshEvent))}
        style={{
          pointerEvents: "auto",
          minHeight: "44px",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: 0,
          borderRadius: "999999px",
          background: DSColor.background.surface.elevated,
          color: DSColor.typography.primary,
          boxShadow: `0 2px 8px ${DSColor.background.surface.scrim}`,
          cursor: isLoading ? "progress" : "pointer",
        }}
      >
        <DSTypography size="textSm" weight="medium">
          {intl.formatMessage({
            id: isLoading ? "wallet.refresh.loading" : "wallet.refresh.label",
          })}
        </DSTypography>
        {isLoading ? (
          <React.Fragment>
            <Gutter size="0.25rem" />
            <animated.span
              aria-hidden="true"
              style={{
                display: "flex",
                transform: rotate.to((v) => `rotate(${v}deg)`),
              }}
            >
              <LoadingIcon size={16} />
            </animated.span>
          </React.Fragment>
        ) : null}
      </button>
    </div>
  );
});
