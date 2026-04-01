import React, { createContext, useLayoutEffect } from "react";
import { generateThemeStylesheet } from "./inject-vars";

export type DSTheme = "dark" | "light";

export interface DSThemeContextValue {
  theme: DSTheme;
}

export const DSThemeContext = createContext<DSThemeContextValue>({
  theme: "dark",
});

export interface DSThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: DSTheme;
  /** When true, skips injecting CSS variables — use when an external provider manages theme vars */
  externalMode?: boolean;
}

export const DSThemeProvider: React.FC<DSThemeProviderProps> = ({
  children,
  defaultTheme = "dark",
  externalMode = false,
}) => {
  useLayoutEffect(() => {
    if (!externalMode) {
      const styleId = "ds-theme-vars";
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement("style");
        styleEl.id = styleId;
        styleEl.textContent = generateThemeStylesheet();
        document.head.appendChild(styleEl);
      }
    }
    document.documentElement.setAttribute("data-ds-theme", defaultTheme);
  }, [defaultTheme, externalMode]);

  return (
    <DSThemeContext.Provider value={{ theme: defaultTheme }}>
      {children}
    </DSThemeContext.Provider>
  );
};
