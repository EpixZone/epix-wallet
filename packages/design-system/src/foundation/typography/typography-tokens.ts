// GENERATED FILE — DO NOT EDIT MANUALLY
// Last synced: 2026-03-30 05:42:12 UTC
// Source: Figma "Supernova Design System" text styles
// Run: yarn workspace @keplr-wallet/design-system sync:tokens

import type { CSSProperties } from "react";

export interface TypographyStyle {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly semibold: CSSProperties;
  readonly medium: CSSProperties;
  readonly regular: CSSProperties;
}

function createStyle(
  fontSize: number,
  lineHeight: number,
  letterSpacing: number
): TypographyStyle {
  const base = { fontSize, lineHeight, letterSpacing };
  return {
    ...base,
    semibold: { ...base, fontWeight: 600 },
    medium: { ...base, fontWeight: 500 },
    regular: { ...base, fontWeight: 400 },
  };
}

/// Supernova Design System Typography
///
/// Usage: dsTypographyTokens.textMd.semibold
export const dsTypographyTokens = {
  textSm: createStyle(15, 1.4, -0.15),
  textMd: createStyle(16, 1.4, -0.16),
  textLg: createStyle(18, 1.4, -0.18),
  textXl: createStyle(20, 1.4, -0.2),
  textXxs: createStyle(12, 1.4, -0.06),
  displayLg: createStyle(36, 1.4, -0.36),
  displaySm: createStyle(28, 1.4, -0.28),
  displayXxs: createStyle(22, 1.4, -0.22),
  textXs: createStyle(14, 1.4, -0.14),
  displayXs: createStyle(24, 1.4, -0.24),
  displayXl: createStyle(48, 1.4, -0.48),
  displayMd: createStyle(32, 1.4, -0.32),
} as const;

export type DSTypographySize = keyof typeof dsTypographyTokens;
