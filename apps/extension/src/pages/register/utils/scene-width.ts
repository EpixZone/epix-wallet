// The register scenes are designed at fixed widths (17.5rem up to 53.75rem)
// that cannot fit a phone at 1:1, and the mobile shells no longer scale a
// fixed-width viewport down. Clamping every scene width to the viewport
// (minus a small gutter) keeps the desktop layout identical while letting
// the scenes go fluid on narrow screens.
//
// The width strings feed the scene transition's width spring, which
// interpolates the numbers inside the string. Every width passed to
// FixedWidthSceneTransition or useFixedWidthScene().setWidth on the register
// page must therefore go through this helper so all of them share the same
// numeric shape.
export const fluidSceneWidth = (width: string): string => {
  return `min(${width}, 100vw - 2rem)`;
};
