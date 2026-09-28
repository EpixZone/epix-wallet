/** A touch modal gets a history entry so Android Back closes it before the page. */
export function bindModalBack(
  close: () => void,
  browser: Pick<
    Window,
    "history" | "addEventListener" | "removeEventListener"
  > = window
): () => void {
  const id = `modal-${Date.now()}-${Math.random()}`;
  const stack = browser.history.state?.epixModals ?? [];
  browser.history.pushState(
    { ...browser.history.state, epixModals: [...stack, id] },
    ""
  );
  let popped = false;
  const onPop = (event: PopStateEvent) => {
    if (!popped && !event.state?.epixModals?.includes(id)) {
      popped = true;
      close();
    }
  };
  browser.addEventListener("popstate", onPop as EventListener);
  return () => {
    browser.removeEventListener("popstate", onPop as EventListener);
    const current = browser.history.state?.epixModals;
    if (!popped && current?.[current.length - 1] === id) {
      browser.history.back();
    }
  };
}
