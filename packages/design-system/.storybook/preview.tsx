import type { Preview } from "@storybook/react";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import { DSThemeProvider } from "../src/theme";
import { DSColor } from "../src/foundation/color";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals["theme"] as "dark" | "light") || "light";
      return (
        <DSThemeProvider defaultTheme={theme}>
          <div
            style={{
              backgroundColor: DSColor.background.surface.ground,
              color: DSColor.typography.primary,
              padding: 40,
              minHeight: "100vh",
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
