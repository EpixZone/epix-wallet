import React, { FunctionComponent } from "react";
import { useIntl } from "react-intl";
import { GuideBox } from "../../../../guide-box";
import { Gutter } from "../../../../gutter";
import { VerticalCollapseTransition } from "../../../../transition/vertical-collapse";

export const ChangesAppliedNotification: FunctionComponent<{
  showChangesApplied: boolean;
}> = ({ showChangesApplied }) => {
  const intl = useIntl();

  return (
    <VerticalCollapseTransition collapsed={!showChangesApplied}>
      <GuideBox
        color="safe"
        title={intl.formatMessage({
          id: "components.input.fee-control.modal.notification.changes-applied",
        })}
      />
      <Gutter size="0.75rem" />
    </VerticalCollapseTransition>
  );
};
