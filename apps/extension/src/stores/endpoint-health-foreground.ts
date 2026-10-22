// Each extension view owns these listeners for its lifetime. Invalidation
// messages refresh snapshots separately; focus only requests bounded due work.
export function installEndpointHealthForeground(
  view: Pick<Window, "addEventListener" | "removeEventListener">,
  document: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >,
  refresh: () => Promise<unknown>,
  check: () => Promise<unknown>,
  onError: (error: unknown) => void
): () => void {
  let disposed = false;
  let pending: Promise<unknown> | undefined;
  const foreground = () => {
    if (disposed || document.visibilityState === "hidden" || pending) return;
    pending = refresh()
      .then(() => (disposed ? undefined : check()))
      .catch(onError)
      .finally(() => {
        pending = undefined;
      });
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    view.removeEventListener("focus", foreground);
    view.removeEventListener("pagehide", pagehide);
    document.removeEventListener("visibilitychange", foreground);
  };
  const pagehide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  view.addEventListener("focus", foreground);
  view.addEventListener("pagehide", pagehide);
  document.addEventListener("visibilitychange", foreground);
  foreground();
  return dispose;
}
