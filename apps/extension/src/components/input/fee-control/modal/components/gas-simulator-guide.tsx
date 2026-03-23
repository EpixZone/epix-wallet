import React, { FunctionComponent } from "react";
import { useIntl } from "react-intl";
import { IGasSimulator } from "@keplr-wallet/hooks";
import { GuideBox } from "../../../../guide-box";

export const GasSimulatorGuideError: FunctionComponent<{
  gasSimulator: IGasSimulator;
}> = ({ gasSimulator }) => {
  const intl = useIntl();

  if (!gasSimulator.uiProperties.error) {
    return null;
  }

  return (
    <GuideBox
      color="danger"
      title={intl.formatMessage({
        id: "components.input.fee-control.modal.guide-title",
      })}
      paragraph={
        gasSimulator.uiProperties.error.message ||
        gasSimulator.uiProperties.error.toString()
      }
    />
  );
};

export const GasSimulatorGuideWarning: FunctionComponent<{
  gasSimulator: IGasSimulator;
}> = ({ gasSimulator }) => {
  const intl = useIntl();

  if (!gasSimulator.uiProperties.warning) {
    return null;
  }

  return (
    <GuideBox
      color="warning"
      title={intl.formatMessage({
        id: "components.input.fee-control.modal.guide-title",
      })}
      paragraph={
        gasSimulator.uiProperties.warning.message ||
        gasSimulator.uiProperties.warning.toString()
      }
    />
  );
};
