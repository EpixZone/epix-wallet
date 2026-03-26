import type { Meta, StoryObj } from "@storybook/react";
import { DSTypography } from "./typography";
import { DSColor } from "../color";
import { dsTypographyTokens } from "./typography-tokens";
import type { DSTypographyTokensKey } from "./typography-tokens";

const font = "Inter, -apple-system, sans-serif";

const SIZES: DSTypographyTokensKey[] = [
  "displayXl",
  "displayLg",
  "displayMd",
  "displaySm",
  "displayXs",
  "displayXxs",
  "textXl",
  "textLg",
  "textMd",
  "textSm",
  "textXs",
  "textXxs",
];

const WEIGHTS = [
  { key: "semibold" as const, label: "Semibold", val: 600 },
  { key: "medium" as const, label: "Medium", val: 500 },
  { key: "regular" as const, label: "Regular", val: 400 },
];

const TYPO_COLORS = [
  { name: "typography.primary", value: DSColor.typography.primary },
  { name: "typography.secondary", value: DSColor.typography.secondary },
  { name: "typography.tertiary", value: DSColor.typography.tertiary },
  { name: "typography.brand", value: DSColor.typography.brand },
  { name: "typography.disabled", value: DSColor.typography.disabled },
  { name: "typography.inverted", value: DSColor.typography.inverted },
  {
    name: "typography.accent.purple",
    value: DSColor.typography.accent.purple,
  },
  {
    name: "typography.alert.medium",
    value: DSColor.typography.alert.medium,
  },
  {
    name: "typography.positive.medium",
    value: DSColor.typography.positive.medium,
  },
  {
    name: "typography.warning.medium",
    value: DSColor.typography.warning.medium,
  },
];

function TokenRow({ sizeKey }: { sizeKey: DSTypographyTokensKey }) {
  const token = dsTypographyTokens[sizeKey];
  return (
    <div
      style={{
        padding: "24px 0",
        borderBottom: `1px solid ${DSColor.stroke.separator.primary}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: font,
            fontSize: 15,
            fontWeight: 600,
            color: DSColor.typography.primary,
          }}
        >
          {sizeKey}
        </span>
        <span
          style={{
            fontFamily: font,
            fontSize: 14,
            color: DSColor.typography.primary,
            opacity: 0.7,
          }}
        >
          {token.fontSize}px &middot; line-height {token.lineHeight} &middot;
          letter-spacing {token.letterSpacing}px
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {WEIGHTS.map((w) => (
          <div
            key={w.key}
            style={{ display: "flex", alignItems: "baseline", gap: 16 }}
          >
            <span
              style={{
                fontFamily: font,
                fontSize: 14,
                color: DSColor.typography.primary,
                opacity: 0.7,
                width: 100,
                flexShrink: 0,
              }}
            >
              {w.label} ({w.val})
            </span>
            <DSTypography
              size={sizeKey}
              weight={w.key}
              color={DSColor.typography.primary}
              style={{ fontFamily: font }}
            >
              The quick brown fox jumps over the lazy dog
            </DSTypography>
          </div>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Typography",
} satisfies Meta;

export default meta;

export const Typography: StoryObj = {
  name: "Typography",
  render: () => (
    <div
      style={{
        fontFamily: font,
        display: "flex",
        flexDirection: "column",
        gap: 40,
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: font,
            fontSize: 32,
            fontWeight: 600,
            color: DSColor.typography.primary,
            margin: "0 0 6px",
            lineHeight: 1.4,
          }}
        >
          Typography
        </h1>
        <p
          style={{
            fontFamily: font,
            fontSize: 17,
            color: DSColor.typography.primary,
            opacity: 0.7,
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          12 size tokens &times; 3 weights. Switch themes in the toolbar.
        </p>
      </div>

      <section>
        <h2
          style={{
            fontFamily: font,
            fontSize: 22,
            fontWeight: 600,
            color: DSColor.typography.primary,
            margin: "0 0 8px",
          }}
        >
          Scale
        </h2>
        {SIZES.map((sizeKey) => (
          <TokenRow key={sizeKey} sizeKey={sizeKey} />
        ))}
      </section>

      <hr
        style={{
          border: "none",
          borderTop: `1px solid ${DSColor.stroke.separator.primary}`,
          margin: 0,
        }}
      />

      <section>
        <h2
          style={{
            fontFamily: font,
            fontSize: 22,
            fontWeight: 600,
            color: DSColor.typography.primary,
            margin: "0 0 16px",
          }}
        >
          Color Roles
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {TYPO_COLORS.map((c) => (
            <div
              key={c.name}
              style={{
                padding: "16px 20px",
                borderRadius: 8,
                backgroundColor: DSColor.background.surface.ground,
                border: "1px solid rgba(0, 0, 0, 0.12)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <DSTypography
                size="textLg"
                weight="medium"
                color={c.value}
                style={{ fontFamily: font }}
              >
                The quick brown fox
              </DSTypography>
              <span
                style={{
                  fontFamily: font,
                  fontSize: 14,
                  color: DSColor.typography.secondary,
                }}
              >
                DSColor.{c.name}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};
