import styled from "styled-components";
import { DSTypography } from "@keplr-wallet/design-system";

export const RegisterH2 = styled(DSTypography).attrs({
  size: "displayLg",
  weight: "semibold",
  style: { fontSize: "clamp(1.375rem, 4vw, 2.25rem)", lineHeight: 1.3 },
})`
  display: block;
  max-width: 100%;
  overflow-wrap: anywhere;
`;
