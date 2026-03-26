import React from "react";
import styled from "styled-components";
import { dsTypographyTokens } from "./typography-tokens";
import type { DSTypographyTokensKey } from "./typography-tokens";

type Weight = "semibold" | "medium" | "regular";

export interface DSTypographyProps extends React.HTMLAttributes<HTMLElement> {
  /** Typography size — e.g. "textMd", "displayLg" */
  size?: DSTypographyTokensKey;
  /** Font weight */
  weight?: Weight;
  /** Override font size (px) */
  fontSize?: number;
  /** Color — DSColor.typography.primary, DSColor.blue400, or any CSS color */
  color?: string;
  /** Render as different HTML element */
  as?: React.ElementType;
}

const Styled = styled.span<{
  $fontSize?: number;
  $lineHeight?: number;
  $letterSpacing?: number;
  $fontWeight?: number;
  $color?: string;
}>`
  ${({ $fontSize }) => $fontSize != null && `font-size: ${$fontSize}px;`}
  ${({ $lineHeight }) => $lineHeight != null && `line-height: ${$lineHeight};`}
  ${({ $letterSpacing }) =>
    $letterSpacing != null && `letter-spacing: ${$letterSpacing}px;`}
  ${({ $fontWeight }) => $fontWeight != null && `font-weight: ${$fontWeight};`}
  ${({ $color }) => $color != null && `color: ${$color};`}
`;

const WEIGHT_VALUE: Record<Weight, number> = {
  semibold: 600,
  medium: 500,
  regular: 400,
};

/**
 * Design System Typography component.
 *
 * @example
 * <DSTypography size="textMd" weight="semibold" color={DSColor.typography.primary}>
 *   Hello
 * </DSTypography>
 *
 * <DSTypography size="displayLg" weight="medium" as="h1" color={DSColor.blue400}>
 *   Title
 * </DSTypography>
 *
 * // Override fontSize
 * <DSTypography size="textMd" fontSize={20}>Custom size</DSTypography>
 */
export const DSTypography = React.forwardRef<HTMLElement, DSTypographyProps>(
  (
    {
      size = "textMd",
      weight = "regular",
      fontSize: fontSizeOverride,
      color,
      as: Component = "span",
      ...rest
    },
    ref
  ) => {
    const token = dsTypographyTokens[size];

    return (
      <Styled
        ref={ref}
        as={Component}
        $fontSize={fontSizeOverride ?? token?.fontSize}
        $lineHeight={token?.lineHeight}
        $letterSpacing={token?.letterSpacing}
        $fontWeight={WEIGHT_VALUE[weight]}
        $color={color}
        {...rest}
      />
    );
  }
);

DSTypography.displayName = "DSTypography";
