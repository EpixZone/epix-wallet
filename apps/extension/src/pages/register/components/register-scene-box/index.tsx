import React, { FunctionComponent, PropsWithChildren } from "react";
import { Box } from "../../../../components/box";
import styled from "styled-components";
import { ColorPalette } from "../../../../styles";

// The scenes are fluid below their design widths, so on narrow (phone)
// viewports the roomy desktop padding would eat most of the scene column.
// && outweighs the padding the Box renders from its paddingX prop.
const ResponsivePaddingBox = styled(Box)`
  @media screen and (max-width: 480px) {
    && {
      padding-left: 1.25rem;
      padding-right: 1.25rem;
    }
  }
`;

export const RegisterSceneBox: FunctionComponent<
  PropsWithChildren<{
    style?: React.CSSProperties;
  }>
> = ({ children, style }) => {
  return (
    <ResponsivePaddingBox paddingX="3.25rem" paddingY="3rem" style={style}>
      {children}
    </ResponsivePaddingBox>
  );
};

const Styles = {
  RegisterSceneBoxHeader: styled.div`
    font-weight: 600;
    font-size: 2rem;
    line-height: 2rem;
    text-align: center;
    color: ${ColorPalette["platinum-500"]};

    margin-bottom: 2rem;
  `,
};

export const RegisterSceneBoxHeader: FunctionComponent<PropsWithChildren> = ({
  children,
}) => {
  return (
    <Styles.RegisterSceneBoxHeader>{children}</Styles.RegisterSceneBoxHeader>
  );
};
