import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-themes"],
  viteFinal: (config) => {
    config.esbuild = {
      ...config.esbuild,
      jsx: "transform",
    };
    return config;
  },
};

export default config;
