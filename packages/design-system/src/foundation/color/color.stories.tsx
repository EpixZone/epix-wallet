import type { Meta, StoryObj } from "@storybook/react";
import { DSColor } from "./index";

const font = "Inter, -apple-system, sans-serif";

const PRIMITIVE_GROUPS = [
  {
    title: "Blue",
    colors: [
      { name: "blue200", value: DSColor.blue200 },
      { name: "blue300", value: DSColor.blue300 },
      { name: "blue400", value: DSColor.blue400 },
      { name: "blue500", value: DSColor.blue500 },
      { name: "blue600", value: DSColor.blue600 },
      { name: "blue700", value: DSColor.blue700 },
      { name: "blue800", value: DSColor.blue800 },
    ],
  },
  {
    title: "Gray",
    colors: [
      { name: "gray10", value: DSColor.gray10 },
      { name: "gray200", value: DSColor.gray200 },
      { name: "gray300", value: DSColor.gray300 },
      { name: "gray400", value: DSColor.gray400 },
      { name: "gray500", value: DSColor.gray500 },
      { name: "gray550", value: DSColor.gray550 },
      { name: "gray600", value: DSColor.gray600 },
      { name: "gray650", value: DSColor.gray650 },
      { name: "gray700", value: DSColor.gray700 },
    ],
  },
  {
    title: "Green",
    colors: [
      { name: "green100", value: DSColor.green100 },
      { name: "green200", value: DSColor.green200 },
      { name: "green400", value: DSColor.green400 },
      { name: "green500", value: DSColor.green500 },
      { name: "green600", value: DSColor.green600 },
      { name: "green800", value: DSColor.green800 },
    ],
  },
  {
    title: "Orange",
    colors: [
      { name: "orange100", value: DSColor.orange100 },
      { name: "orange200", value: DSColor.orange200 },
      { name: "orange400", value: DSColor.orange400 },
      { name: "orange500", value: DSColor.orange500 },
      { name: "orange600", value: DSColor.orange600 },
      { name: "orange800", value: DSColor.orange800 },
    ],
  },
  {
    title: "Yellow",
    colors: [
      { name: "yellow200", value: DSColor.yellow200 },
      { name: "yellow400", value: DSColor.yellow400 },
      { name: "yellow600", value: DSColor.yellow600 },
      { name: "yellow800", value: DSColor.yellow800 },
    ],
  },
  {
    title: "Purple",
    colors: [
      { name: "purple300", value: DSColor.purple300 },
      { name: "purple400", value: DSColor.purple400 },
    ],
  },
];

const SEMANTIC_GROUPS = [
  {
    title: "Fill / Neutral",
    tokens: [
      { name: "fill.neutral.high", value: DSColor.fill.neutral.high },
      { name: "fill.neutral.strong", value: DSColor.fill.neutral.strong },
      { name: "fill.neutral.medium", value: DSColor.fill.neutral.medium },
      { name: "fill.neutral.low", value: DSColor.fill.neutral.low },
    ],
  },
  {
    title: "Fill / Brand",
    tokens: [
      { name: "fill.brand.high", value: DSColor.fill.brand.high },
      { name: "fill.brand.strong", value: DSColor.fill.brand.strong },
      { name: "fill.brand.medium", value: DSColor.fill.brand.medium },
      { name: "fill.brand.low", value: DSColor.fill.brand.low },
    ],
  },
  {
    title: "Fill / Positive",
    tokens: [
      { name: "fill.positive.high", value: DSColor.fill.positive.high },
      { name: "fill.positive.strong", value: DSColor.fill.positive.strong },
      { name: "fill.positive.medium", value: DSColor.fill.positive.medium },
      { name: "fill.positive.low", value: DSColor.fill.positive.low },
    ],
  },
  {
    title: "Fill / Alert & Warning",
    tokens: [
      { name: "fill.alert.medium", value: DSColor.fill.alert.medium },
      { name: "fill.warning.medium", value: DSColor.fill.warning.medium },
    ],
  },
  {
    title: "Background",
    tokens: [
      {
        name: "background.surface.elevated",
        value: DSColor.background.surface.elevated,
      },
      {
        name: "background.surface.surface",
        value: DSColor.background.surface.surface,
      },
      {
        name: "background.surface.ground",
        value: DSColor.background.surface.ground,
      },
    ],
  },
  {
    title: "Typography",
    tokens: [
      { name: "typography.primary", value: DSColor.typography.primary },
      { name: "typography.secondary", value: DSColor.typography.secondary },
      { name: "typography.tertiary", value: DSColor.typography.tertiary },
      { name: "typography.brand", value: DSColor.typography.brand },
      { name: "typography.disabled", value: DSColor.typography.disabled },
      { name: "typography.inverted", value: DSColor.typography.inverted },
    ],
  },
  {
    title: "Button",
    tokens: [
      { name: "button.primary", value: DSColor.button.primary },
      { name: "button.alert", value: DSColor.button.alert },
      { name: "button.warning", value: DSColor.button.warning },
      { name: "button.secondary", value: DSColor.button.secondary },
      { name: "button.disabled", value: DSColor.button.disabled },
    ],
  },
];

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: "100%",
          aspectRatio: "1.2",
          borderRadius: 8,
          backgroundColor: value,
          border: "1px solid rgba(0, 0, 0, 0.12)",
          marginBottom: 6,
        }}
      />
      <div
        style={{
          fontFamily: font,
          fontSize: 14,
          fontWeight: 600,
          color: DSColor.typography.primary,
          lineHeight: 1.4,
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontFamily: font,
          fontSize: 13,
          color: DSColor.typography.primary,
          lineHeight: 1.4,
          opacity: 0.7,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SemanticSwatch({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: "100%",
          height: 48,
          borderRadius: 8,
          backgroundColor: value,
          border: "1px solid rgba(0, 0, 0, 0.12)",
          marginBottom: 6,
        }}
      />
      <div
        style={{
          fontFamily: font,
          fontSize: 14,
          fontWeight: 500,
          color: DSColor.typography.primary,
          lineHeight: 1.5,
          wordBreak: "break-all" as const,
        }}
      >
        DSColor.{name}
      </div>
    </div>
  );
}

const meta = {
  title: "Foundations/Color",
} satisfies Meta;

export default meta;

export const Color: StoryObj = {
  name: "Color",
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
          Color
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
          Primitive colors are fixed. Semantic colors adapt to theme — switch in
          the toolbar.
        </p>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <h2
          style={{
            fontFamily: font,
            fontSize: 20,
            fontWeight: 600,
            color: DSColor.typography.primary,
            margin: "0 0 16px",
          }}
        >
          Primitives
        </h2>
        {PRIMITIVE_GROUPS.map((group) => (
          <div key={group.title}>
            <h3
              style={{
                fontFamily: font,
                fontSize: 14,
                fontWeight: 600,
                color: DSColor.typography.primary,
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
                margin: "0 0 12px",
              }}
            >
              {group.title}
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
                gap: 12,
              }}
            >
              {group.colors.map((c) => (
                <Swatch key={c.name} name={c.name} value={c.value} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <hr
        style={{
          border: "none",
          borderTop: `1px solid ${DSColor.stroke.separator.primary}`,
          margin: 0,
        }}
      />

      <section style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <h2
          style={{
            fontFamily: font,
            fontSize: 20,
            fontWeight: 600,
            color: DSColor.typography.primary,
            margin: "0 0 16px",
          }}
        >
          Semantic
        </h2>
        {SEMANTIC_GROUPS.map((group) => (
          <div key={group.title}>
            <h3
              style={{
                fontFamily: font,
                fontSize: 14,
                fontWeight: 600,
                color: DSColor.typography.primary,
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
                margin: "0 0 12px",
              }}
            >
              {group.title}
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {group.tokens.map((t) => (
                <SemanticSwatch key={t.name} name={t.name} value={t.value} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  ),
};
