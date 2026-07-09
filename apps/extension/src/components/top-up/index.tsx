import { IFeeConfig } from "@keplr-wallet/hooks";
import React, { FunctionComponent } from "react";
import { Subtitle3, Subtitle4 } from "../typography";
import { ColorPalette } from "../../styles";
import { useStore } from "../../stores";
import { useTheme } from "styled-components";
import { FormattedMessage } from "react-intl";
import { useNavigate } from "react-router";

export const FeeCoverageDescription: FunctionComponent<{
  isTopUpAvailable: boolean;
}> = ({ isTopUpAvailable }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        lineHeight: "155%",
        padding: "0.25rem 0",
      }}
    >
      <Subtitle4
        color={ColorPalette["gray-300"]}
        style={{ textAlign: "center" }}
      >
        <FormattedMessage id="components.top-up.description.we-cover-upper" />
        {isTopUpAvailable ? (
          <React.Fragment>
            <br />
            <span style={{ color: ColorPalette["purple-500"] }}>
              <FormattedMessage id="components.top-up.description.we-cover" />
            </span>
          </React.Fragment>
        ) : null}
      </Subtitle4>
    </div>
  );
};

export const StakingRequirementDescription: FunctionComponent<{
  requiredStaking: number;
  coinDenom: string;
  stakingChainId: string;
  validatorAddress: string;
}> = ({ requiredStaking, coinDenom, stakingChainId, validatorAddress }) => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        lineHeight: "155%",
        padding: "0.25rem 0",
      }}
    >
      <Subtitle4
        color={ColorPalette["gray-300"]}
        style={{ textAlign: "center" }}
      >
        <FormattedMessage
          id="components.top-up.description.staking-required"
          values={{
            amount: requiredStaking.toLocaleString(),
            coinDenom,
          }}
        />
      </Subtitle4>
      <span
        onClick={(e) => {
          e.preventDefault();
          navigate(
            `/stake/delegate/${encodeURIComponent(
              stakingChainId
            )}/${encodeURIComponent(validatorAddress)}`
          );
        }}
        style={{
          display: "inline-block",
          color: ColorPalette["purple-500"],
          fontSize: "0.75rem",
          fontWeight: 600,
          textDecoration: "underline",
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <FormattedMessage id="components.top-up.description.stake-now" />
      </span>
    </div>
  );
};

export const FeeCoverageBox = ({ feeConfig }: { feeConfig: IFeeConfig }) => {
  const theme = useTheme();
  const { priceStore } = useStore();
  const price = (() => {
    if (!feeConfig.fees[0]) {
      return undefined;
    }
    return priceStore.calculatePrice(feeConfig.fees[0]);
  })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          padding: "1rem",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.75rem",
          borderRadius: "0.375rem",
          background:
            ColorPalette[theme.mode === "light" ? "white" : "gray-600"],
          boxShadow:
            theme.mode === "light"
              ? "0 1px 4px 0 rgba(43, 39, 55, 0.10)"
              : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Subtitle3
            color={
              ColorPalette[theme.mode === "light" ? "gray-500" : "gray-200"]
            }
          >
            <FormattedMessage id="components.top-up.tx-fee" />
          </Subtitle3>
          <Subtitle3
            color={
              ColorPalette[theme.mode === "light" ? "purple-500" : "purple-400"]
            }
          >
            <FormattedMessage id="components.top-up.covered-by-keplr" /> ✨
          </Subtitle3>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Subtitle3
            style={{
              textDecoration: "line-through",
              textDecorationColor: ColorPalette["gray-300"],
            }}
          >
            <span
              style={{
                color:
                  ColorPalette[
                    theme.mode === "light" ? "gray-600" : "gray-200"
                  ],
              }}
            >
              {feeConfig.fees[0]?.toString()}{" "}
            </span>
            <span style={{ color: ColorPalette["gray-300"] }}>
              ({price?.toString()})
            </span>
          </Subtitle3>
        </div>
      </div>
      <Subtitle3
        color={ColorPalette["gray-300"]}
        style={{ textAlign: "center" }}
      >
        <FormattedMessage id="components.top-up.keep-window-open" />
      </Subtitle3>
    </div>
  );
};

export const FeeCoverageBackground = ({ hideIcon }: { hideIcon?: boolean }) => {
  const theme = useTheme();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100vw",
        height: "9.75rem",
        background:
          theme.mode === "light"
            ? "rgba(105, 233, 245, 0.2)"
            : "rgba(105, 233, 245, 0.08)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "1.25rem",
          height: "1.25rem",
          display: hideIcon ? "none" : "block",
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            opacity={theme.mode === "light" ? "0.25" : "0.45"}
            d="M10 0C10.9828 5.06035 14.9396 9.01717 20 10C14.9396 10.9828 10.9828 14.9396 10 20C9.01717 14.9396 5.06035 10.9828 0 10C5.06035 9.01717 9.01717 5.06035 10 0Z"
            fill={ColorPalette["cyan-500"]}
          />
        </svg>
      </div>
    </div>
  );
};
