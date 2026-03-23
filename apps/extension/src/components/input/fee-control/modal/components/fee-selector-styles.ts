import styled from "styled-components";
import { ColorPalette } from "../../../../../styles";
import { H5, Caption1, Caption2 } from "../../../../typography";

export const FeeSelectorStyle = {
  Item: styled.div<{ selected: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem;

    cursor: pointer;

    background-color: ${({ selected, theme }) =>
      selected
        ? ColorPalette["blue-400"]
        : theme.mode === "light"
        ? ColorPalette["blue-50"]
        : ColorPalette["gray-500"]};
  `,
  Title: styled(H5)<{ selected: boolean }>`
    color: ${({ selected, theme }) =>
      selected
        ? theme.mode === "light"
          ? ColorPalette["gray-50"]
          : ColorPalette["gray-50"]
        : theme.mode === "light"
        ? ColorPalette["blue-400"]
        : ColorPalette["gray-50"]};
  `,
  Price: styled(Caption2)<{ selected: boolean }>`
    white-space: nowrap;
    margin-top: 0.25rem;
    color: ${({ selected, theme }) =>
      selected
        ? ColorPalette["blue-200"]
        : theme.mode === "light"
        ? ColorPalette["blue-500"]
        : ColorPalette["gray-300"]};
  `,
  Amount: styled(Caption1)<{ selected: boolean }>`
    white-space: nowrap;
    margin-top: 0.25rem;
    color: ${({ selected }) =>
      selected ? ColorPalette["blue-100"] : ColorPalette["gray-200"]};
  `,
};
