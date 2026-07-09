import React, { FunctionComponent } from "react";
import { FormattedMessage } from "react-intl";
import { useTheme } from "styled-components";
import { ColorPalette } from "../../../../../styles";
import { Body3 } from "../../../../typography";
import { Toggle } from "../../../../toggle";
import { Gutter } from "../../../../gutter";
import { UIConfigStore } from "../../../../../stores/ui-config";

export const RememberFeeOptionToggle: FunctionComponent<{
  uiConfigStore: UIConfigStore;
}> = ({ uiConfigStore }) => {
  const theme = useTheme();

  return (
    <React.Fragment>
      <div
        style={{
          width: "0.375rem",
          height: "0.375rem",
          borderRadius: "99999px",
          backgroundColor:
            theme.mode === "light"
              ? ColorPalette["purple-400"]
              : ColorPalette["purple-400"],
          marginRight: "0.3rem",
        }}
      />
      <Body3
        color={
          theme.mode === "light"
            ? ColorPalette["gray-300"]
            : ColorPalette["gray-200"]
        }
      >
        <FormattedMessage id="components.input.fee-control.modal.remember-last-fee-option" />
      </Body3>
      <Gutter size="0.5rem" />
      <Toggle
        isOpen={uiConfigStore.rememberLastFeeOption}
        setIsOpen={(v) => uiConfigStore.setRememberLastFeeOption(v)}
      />
    </React.Fragment>
  );
};
