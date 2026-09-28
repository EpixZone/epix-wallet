import styled from "styled-components";
import { DSTypography } from "@keplr-wallet/design-system";

export const RegisterH3 = styled(DSTypography).attrs({
  size: "displayXs",
  weight: "semibold",
  style: { fontSize: "clamp(1.25rem, 4vw, 1.5rem)", lineHeight: 1.3 },
})`
  display: block;
  max-width: 100%;
  overflow-wrap: anywhere;
`;
