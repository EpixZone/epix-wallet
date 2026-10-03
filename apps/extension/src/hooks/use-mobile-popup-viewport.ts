import { useLayoutEffect } from "react";
import { isMobileShell } from "../utils/mobile-shell";

/** Gecko can retain the keyboard height in its layout viewport after IME close. */
export function trackMobilePopupViewport(win: Window, root: HTMLElement) {
  const viewport = win.visualViewport;
  let frame = 0;
  const update = () => {
    // Preserve pinch zoom instead of reflowing the wallet underneath it.
    if (viewport && viewport.scale !== 1) return;
    const height = viewport?.height ?? win.innerHeight;
    const top = viewport?.offsetTop ?? 0;
    if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(top))
      return;
    root.style.setProperty("--wallet-viewport-height", `${height}px`);
    root.style.setProperty("--wallet-viewport-top", `${Math.max(0, top)}px`);
    root.setAttribute("data-mobile-popup-viewport", "true");
  };
  const scheduleUpdate = () => {
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(update);
  };
  update();
  win.addEventListener("resize", scheduleUpdate);
  viewport?.addEventListener("resize", scheduleUpdate);
  viewport?.addEventListener("scroll", scheduleUpdate);
  return () => {
    win.cancelAnimationFrame(frame);
    win.removeEventListener("resize", scheduleUpdate);
    viewport?.removeEventListener("resize", scheduleUpdate);
    viewport?.removeEventListener("scroll", scheduleUpdate);
    root.removeAttribute("data-mobile-popup-viewport");
    root.style.removeProperty("--wallet-viewport-height");
    root.style.removeProperty("--wallet-viewport-top");
  };
}

export function useMobilePopupViewport() {
  useLayoutEffect(() => {
    if (!isMobileShell()) return;
    return trackMobilePopupViewport(window, document.documentElement);
  }, []);
}
