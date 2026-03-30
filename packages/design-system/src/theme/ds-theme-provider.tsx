import React, {
  createContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { generateThemeStylesheet } from "./inject-vars";

export type DSTheme = "dark" | "light";

export interface DSThemeContextValue {
  theme: DSTheme;
  setTheme: (theme: DSTheme) => void;
}

export const DSThemeContext = createContext<DSThemeContextValue>({
  theme: "dark",
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setTheme: () => {},
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
  const [theme, setTheme] = useState<DSTheme>(defaultTheme);

  useEffect(() => {
    setTheme(defaultTheme);
  }, [defaultTheme]);

  useLayoutEffect(() => {
    if (!externalMode) {
      const styleId = "ds-theme-vars";
      let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = generateThemeStylesheet();
    }
    document.documentElement.setAttribute("data-ds-theme", theme);
  }, [theme, externalMode]);

  return (
    <DSThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </DSThemeContext.Provider>
  );
};
