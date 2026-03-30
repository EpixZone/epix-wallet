import { useContext } from "react";
import { DSThemeContext } from "./ds-theme-provider";
import type { DSThemeContextValue } from "./ds-theme-provider";

export function useTheme(): DSThemeContextValue {
  return useContext(DSThemeContext);
}
