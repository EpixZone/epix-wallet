import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  Title,
  Description,
  Primary,
  Controls,
} from "@storybook/addon-docs/blocks";
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
  title: "Foundations/Typography",
  component: DSTypography,
  tags: ["autodocs"],
  parameters: {
    docs: {
      page: () => (
        <React.Fragment>
          <Title />
          <Description />
          <Primary />
          <h2 style={{ fontWeight: 600, marginTop: 32, marginBottom: 16 }}>
            Props
          </h2>
          <Controls />
        </React.Fragment>
      ),
    },
  },
  argTypes: {
    size: {
      control: "select",
      options: Object.keys(dsTypographyTokens) as DSTypographyTokensKey[],
      description: "Typography size token",
    },
    weight: {
      control: "select",
      options: ["semibold", "medium", "regular"],
      description: "Font weight",
    },
    fontSize: {
      control: "number",
      description: "Override font size (px)",
    },
    color: {
      control: "color",
      description: "Text color — DSColor token or any CSS color",
    },
    as: {
      control: "select",
      options: ["span", "p", "h1", "h2", "h3", "h4", "div", "label"],
      description: "HTML element to render as",
    },
  },
} satisfies Meta<typeof DSTypography>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @internal Docs preview — hidden from sidebar */
export const _DocsPreview: Story = {
  tags: ["!dev"],
  parameters: {
    docs: {
      story: { inline: true },
      canvas: { withToolbar: false, sourceState: "shown" },
      source: {
        code: `<DSTypography size="textMd" weight="medium" color={DSColor.typography.primary}>
  The quick brown fox jumps over the lazy dog
</DSTypography>`,
      },
    },
  },
  args: {
    size: "textMd",
    weight: "medium",
    color: DSColor.typography.primary,
    children: "The quick brown fox jumps over the lazy dog",
  },
};

/** Full showcase of all typography tokens */
export const Showcase: Story = {
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
            fontSize: 28,
            fontWeight: 600,
            color: DSColor.typography.primary,
            margin: "0 0 8px",
            lineHeight: 1.4,
          }}
        >
          Typography
        </h1>
        <p
          style={{
            fontFamily: font,
            fontSize: 16,
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
            fontSize: 20,
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
            fontSize: 20,
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

/** Interactive playground — use Controls to change props */
export const Playground: Story = {
  args: {
    size: "textMd",
    weight: "medium",
    color: DSColor.typography.primary,
    children: "The quick brown fox jumps over the lazy dog",
  },
};
