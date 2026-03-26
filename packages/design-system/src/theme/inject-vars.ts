import { darkThemeValues, lightThemeValues } from "../foundation/color/color";

export function generateThemeStylesheet(): string {
  const darkVars = Object.entries(darkThemeValues)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  const lightVars = Object.entries(lightThemeValues)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `[data-ds-theme="dark"] {\n${darkVars}\n}\n[data-ds-theme="light"] {\n${lightVars}\n}`;
}
