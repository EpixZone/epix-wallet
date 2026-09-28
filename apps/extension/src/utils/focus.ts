/** Keep touch onboarding readable until the user chooses an input. */
export const focusForKeyboard = (element: HTMLElement | null) => {
  if (
    navigator.maxTouchPoints === 0 &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    element?.focus({ preventScroll: true });
  }
};
