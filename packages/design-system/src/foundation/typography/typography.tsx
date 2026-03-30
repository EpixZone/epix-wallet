import React from "react";
import { dsTypographyTokens } from "./typography-tokens";
import type { DSTypographySize } from "./typography-tokens";

type Weight = "semibold" | "medium" | "regular";

const WEIGHT_VALUE: Record<Weight, number> = {
  semibold: 600,
  medium: 500,
  regular: 400,
};

export interface DSTypographyProps extends React.HTMLAttributes<HTMLElement> {
  /** Size token: `displayXl` · `displayLg` · `displayMd` · `displaySm` · `displayXs` · `displayXxs` · `textXl` · `textLg` · `textMd` · `textSm` · `textXs` · `textXxs` */
  size?: DSTypographySize;
  /** Font weight: `semibold` (600) · `medium` (500) · `regular` (400) */
  weight?: Weight;
  /** Override token font size (px) */
  fontSize?: number;
  /** Text color — `DSColor.typography.primary`, `DSColor.blue400`, or any CSS color */
  color?: string;
  /** HTML element to render as — `"span"`, `"p"`, `"h1"`, `"div"`, `"label"`, etc. */
  as?: React.ElementType;
}

/** Design System Typography component. */
export const DSTypography = React.forwardRef<HTMLElement, DSTypographyProps>(
  (
    {
      size = "textMd",
      weight = "regular",
      fontSize: fontSizeOverride,
      color,
      as: Component = "span",
      style,
      ...rest
    },
    ref
  ) => {
    const token = dsTypographyTokens[size];

    return (
      <Component
        ref={ref}
        style={{
          fontSize: fontSizeOverride ?? token?.fontSize,
          lineHeight: token?.lineHeight,
          letterSpacing: token?.letterSpacing,
          fontWeight: WEIGHT_VALUE[weight],
          color,
          ...style,
        }}
        {...rest}
      />
    );
  }
);

DSTypography.displayName = "DSTypography";
