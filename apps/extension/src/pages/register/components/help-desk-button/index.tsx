import React, { FunctionComponent } from "react";
import styled from "styled-components";
import { DSColor, DSTypography } from "@keplr-wallet/design-system";
import { HelpDeskUrl } from "../../../../config.ui";
import { FormattedMessage } from "react-intl";

const HelpLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0.5rem;
  color: ${DSColor.typography.secondary};
  text-decoration: underline;
  text-underline-offset: 0.2em;
`;

export const HelpDeskButton: FunctionComponent = () => (
  <HelpLink href={HelpDeskUrl} target="_blank" rel="noreferrer">
    <DSTypography size="textSm">
      <FormattedMessage id="pages.register.components.help-desk-button.title" />
    </DSTypography>
  </HelpLink>
);
