import styled from "styled-components";
import { ColorPalette } from "../../../../styles";
import { DSColor } from "@keplr-wallet/design-system";

export const Styles = {
  Container: styled.div`
    position: relative;

    padding: 1.5rem 1.75rem 1.25rem;

    background-color: ${(props) =>
      props.theme.mode === "light"
        ? ColorPalette["gray-10"]
        : ColorPalette["gray-500"]};
    border-radius: 1rem;

    color: ${(props) =>
      props.theme.mode === "light"
        ? ColorPalette["gray-300"]
        : ColorPalette["gray-100"]};
    font-size: 0.875rem;

    ul {
      line-height: 1.3;

      margin: 0;
      padding-left: 1.2rem;
    }
  `,
  Title: styled.div`
    padding-right: 2rem;
    overflow-wrap: anywhere;
    color: ${(props) =>
      props.theme.mode === "light"
        ? ColorPalette["gray-500"]
        : ColorPalette["white"]};

    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.2px;
    font-weight: 700;
  `,
  CloseContainer: styled.button`
    position: absolute;

    top: 0.75rem;
    right: 0.75rem;
    width: 2.75rem;
    height: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    color: ${DSColor.typography.secondary};
    cursor: pointer;
  `,
  SubTitle: styled.div`
    color: ${(props) =>
      props.theme.mode === "light"
        ? ColorPalette["gray-500"]
        : ColorPalette["gray-100"]};

    font-size: 0.875rem;
    line-height: 1.05rem;
    font-weight: 500;
  `,
  InputsContainer: styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.375rem;

    @media screen and (max-width: 480px) {
      flex-wrap: wrap;
      > div:first-child {
        width: 100%;
      }
      input {
        padding-left: 0.25rem;
        padding-right: 0.25rem;
      }
    }

    font-size: 1rem;
    line-height: 1.2;
    letter-spacing: 0.2px;
    color: ${(props) =>
      props.theme.mode === "light"
        ? ColorPalette["gray-400"]
        : ColorPalette["gray-100"]};
  `,
  InputContainer: styled.div`
    flex: 1;
    min-width: 0;
  `,
  LightText: styled.div`
    color: ${(props) =>
      props.theme.mode === "light"
        ? ColorPalette["gray-400"]
        : ColorPalette["gray-100"]};
  `,
};
