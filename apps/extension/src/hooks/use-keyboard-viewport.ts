import { useEffect } from "react";

/** Keep the focused field visible after a mobile host resizes for its keyboard. */
export function useKeyboardViewport() {
  useEffect(() => {
    if (navigator.maxTouchPoints === 0) return;
    let height = window.innerHeight;
    let frame = 0;
    const resize = () => {
      const next = window.innerHeight;
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
          if (rect.bottom > next || rect.top < 0) {
            input.scrollIntoView({ block: "center" });
          }
        }
      });
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);
}
