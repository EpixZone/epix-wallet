export const WalletRefreshEvent = "epix-wallet-refresh";

export type RefreshMode = "automatic" | "manual";

export function startWalletRefresh({
  document,
  window,
  intervalMs,
  canRefresh,
  refresh,
  onStart,
  onSettled,
  onError,
}: {
  document: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >;
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  intervalMs: number;
  canRefresh: () => boolean;
  refresh: (mode: RefreshMode) => Promise<void>;
  onStart: (mode: RefreshMode) => void;
  onSettled: (mode: RefreshMode) => void;
  onError: (error: unknown, mode: RefreshMode) => void;
}) {
  let disposed = false;
  let inFlight: Promise<void> | undefined;
  let pending: RefreshMode | undefined;

  const request = (
    mode: RefreshMode = "automatic",
    queueIfBusy = true
  ): Promise<void> => {
    if (disposed || document.visibilityState !== "visible" || !canRefresh()) {
      return Promise.resolve();
    }
    if (inFlight) {
      // Coalesce account changes, resume events and clicks into one later run.
      // Timer ticks never queue more work behind a slow request.
      if (queueIfBusy && pending !== "manual") pending = mode;
      return inFlight;
    }
    onStart(mode);
    inFlight = Promise.resolve()
      .then(() => {
        if (
          !disposed &&
          document.visibilityState === "visible" &&
          canRefresh()
        ) {
          return refresh(mode);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) onError(error, mode);
      })
      .finally(() => {
        if (!disposed) onSettled(mode);
        inFlight = undefined;
        if (pending) {
          const next = pending;
          pending = undefined;
          return request(next, false);
        }
      });
    return inFlight;
  };

  const resume = () => void request();
  const manual = () => void request("manual");
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener(WalletRefreshEvent, manual);
  const timer = setInterval(() => void request("automatic", false), intervalMs);
  resume();

  return {
    refresh: request,
    dispose() {
      disposed = true;
      pending = undefined;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener(WalletRefreshEvent, manual);
    },
  };
}

export function isWalletRefreshRoute(pathname: string): boolean {
  return (
    [
      "/",
      "/history",
      "/stake",
      "/stake/explore",
      "/stake/empty",
      "/stake/validators",
    ].includes(pathname) ||
    pathname.startsWith("/stake/validator/") ||
    pathname.startsWith("/tx-history-detail/")
  );
}
