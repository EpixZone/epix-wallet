import type { Meta, StoryObj } from "@storybook/react";

const font = "Inter, -apple-system, sans-serif";

const meta = {
  title: "Components/Overview",
} satisfies Meta;

export default meta;

export const Overview: StoryObj = {
  name: "Overview",
  render: () => (
    <div
      style={{
        fontFamily: font,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <h1
        style={{
          fontFamily: font,
          fontSize: 28,
          fontWeight: 600,
          margin: "0 0 8px",
          lineHeight: 1.4,
        }}
      >
        Components
      </h1>
      <p
        style={{
          fontFamily: font,
          fontSize: 16,
          opacity: 0.7,
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        Components will be added here.
      </p>
    </div>
  ),
};
