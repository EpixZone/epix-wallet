import { useEffect } from "react";

/** Keep the focused field visible after a mobile host resizes for its keyboard. */
export function useKeyboardViewport() {
  useEffect(() => {
    if (navigator.maxTouchPoints === 0) return;
    const viewport = window.visualViewport;
    let height = viewport?.height ?? window.innerHeight;
    let frame = 0;
    const resize = () => {
      if (viewport && viewport.scale !== 1) return;
      const next = viewport?.height ?? window.innerHeight;
      const shrinking = next < height;
      height = next;
      if (!shrinking) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = document.activeElement;
        if (
          input instanceof HTMLElement &&
          input.matches("input, textarea, [contenteditable=true]")
        ) {
          const rect = input.getBoundingClientRect();
          // Android reports layout-relative client rectangles; WebKit can
          // already report them relative to the visible viewport.
          const top = /Android/i.test(navigator.userAgent)
            ? viewport?.offsetTop ?? 0
            : 0;
          if (rect.bottom > top + next || rect.top < top) {
            input.scrollIntoView({ block: "center" });
          }
        }
      });
    };
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
    };
  }, []);
}
