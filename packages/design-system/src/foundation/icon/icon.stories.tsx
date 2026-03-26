import type { Meta, StoryObj } from "@storybook/react";
import { DSColor } from "../color";
import * as Icons from "./index";

const font = "Inter, -apple-system, sans-serif";

// Collect all icon components from exports
const iconEntries = Object.entries(Icons).filter(
  ([name, val]) => name.endsWith("Icon") && typeof val === "function"
) as Array<[string, React.FC<Icons.DSIconProps>]>;

const meta = {
  title: "Icon",
} satisfies Meta;

export default meta;

export const Icon: StoryObj = {
  name: "Icon",
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
            fontSize: 32,
            fontWeight: 600,
            color: DSColor.typography.primary,
            margin: "0 0 6px",
          }}
        >
          Icon
        </h1>
        <p
          style={{
            fontSize: 17,
            color: DSColor.typography.primary,
            opacity: 0.7,
            margin: 0,
          }}
        >
          {iconEntries.length} icons synced from Figma. All icons accept{" "}
          <code
            style={{
              fontSize: 15,
              backgroundColor: DSColor.fill.neutral.low,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            size
          </code>{" "}
          and{" "}
          <code
            style={{
              fontSize: 15,
              backgroundColor: DSColor.fill.neutral.low,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            color
          </code>{" "}
          props.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 8,
        }}
      >
        {iconEntries.map(([name, IconComponent]) => {
          const displayName = name.replace(/Icon$/, "");
          return (
            <div
              key={name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "20px 8px 14px",
                borderRadius: 8,
                border: "1px solid rgba(0, 0, 0, 0.08)",
                backgroundColor: DSColor.fill.neutral.low,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 24,
                }}
              >
                <IconComponent size={24} color={DSColor.typography.primary} />
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: DSColor.typography.primary,
                  opacity: 0.7,
                  textAlign: "center",
                  lineHeight: 1.3,
                  wordBreak: "break-all" as const,
                }}
              >
                {displayName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  ),
};
