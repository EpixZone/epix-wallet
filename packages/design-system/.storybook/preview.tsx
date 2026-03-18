import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#1D1D1F" },
        { name: "light", value: "#FFFFFF" },
      ],
    },
  },
};

export default preview;
