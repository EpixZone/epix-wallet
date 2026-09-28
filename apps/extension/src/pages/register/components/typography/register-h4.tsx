import styled from "styled-components";
import { DSTypography } from "@keplr-wallet/design-system";

export const RegisterH4 = styled(DSTypography).attrs({
  size: "textXl",
  weight: "medium",
  style: { fontSize: "1.25rem", lineHeight: 1.3 },
})`
  display: block;
  max-width: 100%;
  overflow-wrap: anywhere;
`;
