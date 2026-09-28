import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import type {
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
  ISenderConfig,
} from "@keplr-wallet/hooks";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";
import { Box } from "../../../components/box";
import { Gutter } from "../../../components/gutter";
import { Stack } from "../../../components/stack";
import { FeeControl } from "../../../components/input/fee-control";

export const StakeTxLayout: FunctionComponent<{
  title: string;
  isLoading: boolean;
  interactionBlocked: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  sendConfigs: {
    senderConfig: ISenderConfig;
    feeConfig: IFeeConfig;
    gasConfig: IGasConfig;
  };
  gasSimulator: IGasSimulator;
  children: React.ReactNode;
}> = observer(
  ({
    title,
    isLoading,
    interactionBlocked,
    onSubmit,
    sendConfigs,
    gasSimulator,
    children,
  }) => {
    const intl = useIntl();

    return (
      <HeaderLayout
        title={title}
        displayFlex={true}
        left={<BackButton />}
        bottomButtons={[
          {
            disabled: interactionBlocked,
            text: intl.formatMessage({ id: "button.next" }),
            color: "primary",
            size: "large",
            type: "submit",
            isLoading,
          },
        ]}
        onSubmit={onSubmit}
      >
        <Box
          paddingX="0.75rem"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Gutter size="0.75rem" />

          <Stack gutter="0.75rem">{children}</Stack>

          <div style={{ flex: 1 }} />

          <FeeControl
            senderConfig={sendConfigs.senderConfig}
            feeConfig={sendConfigs.feeConfig}
            gasConfig={sendConfigs.gasConfig}
            gasSimulator={gasSimulator}
          />

          <Gutter size="1rem" />
        </Box>
      </HeaderLayout>
    );
  }
);
