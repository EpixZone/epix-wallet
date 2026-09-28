import styled from "styled-components";
import { DSTypography } from "@keplr-wallet/design-system";

export const RegisterH1 = styled(DSTypography).attrs({
  size: "displayXl",
  weight: "semibold",
  style: { fontSize: "clamp(1.5rem, 5vw, 3rem)", lineHeight: 1.3 },
})`
  display: block;
  max-width: 100%;
  overflow-wrap: anywhere;
`;
