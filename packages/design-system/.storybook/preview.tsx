import React from "react";
import type { Preview } from "@storybook/react";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import { DSThemeProvider } from "../src/theme";
import { DSColor } from "../src/foundation/color";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    options: {
      storySort: {
        order: [
          "Foundations",
          ["Color", "Icon", "Typography", ["Docs", "Typography", "Playground"]],
          "Components",
        ],
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals["theme"] as "dark" | "light") || "light";
      const isDocs = context.viewMode === "docs";
      return (
        <DSThemeProvider defaultTheme={theme}>
          <div
            style={{
              backgroundColor: DSColor.background.surface.ground,
              color: DSColor.typography.primary,
              padding: isDocs ? 16 : 40,
              minHeight: isDocs ? undefined : "100vh",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <Story />
          </div>
        </DSThemeProvider>
      );
    },
    withThemeByDataAttribute({
      themes: {
        light: "light",
        dark: "dark",
      },
      defaultTheme: "light",
      attributeName: "data-ds-theme",
    }),
  ],
};

export default preview;
