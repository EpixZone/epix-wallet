import React, { FunctionComponent, ReactNode } from "react";
import styled from "styled-components";
import { ColorPalette } from "../../../../styles";

// The two-option layout of the intro scenes: two equal columns separated by
// a hairline divider at the scene's design width, stacking vertically on
// narrow viewports where the register scenes are fluid.
const Container = styled.div`
  display: flex;
  flex-direction: row;
  gap: 2.5rem;

  @media screen and (max-width: 640px) {
    flex-direction: column;
  }
`;

const Column = styled.div`
  flex: 1 1 0%;
  min-width: 0;
`;

const Divider = styled.div`
  flex: 0 0 auto;
  width: 1px;
  background-color: ${(props) =>
    props.theme.mode === "light"
      ? ColorPalette["gray-100"]
      : ColorPalette["gray-400"]};

  @media screen and (max-width: 640px) {
    width: auto;
    height: 1px;
  }
`;

export const IntroColumns: FunctionComponent<{
  left: ReactNode;
  right: ReactNode;
}> = ({ left, right }) => {
  return (
    <Container>
      <Column>{left}</Column>
      <Divider />
      <Column>{right}</Column>
    </Container>
  );
};
