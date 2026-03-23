import styled from "styled-components";
import { ColorPalette } from "../../../../../styles";

export const ModalContainer = styled.div`
  display: flex;
  flex-direction: column;

  width: 100%;

  padding: 0.75rem;
  padding-top: 0.88rem;

  background-color: ${(props) =>
    props.theme.mode === "light"
      ? ColorPalette.white
      : ColorPalette["gray-600"]};
`;
