import { observer } from "mobx-react-lite";
import React, { FunctionComponent } from "react";
import { MainHeaderLayout } from "../main/layouts/header";
import styled, { useTheme } from "styled-components";
import { ColorPalette } from "../../styles";
import { Box } from "../../components/box";
import { MainH1 } from "../../components/typography/main-h1";
import { useIntl } from "react-intl";
import { Gutter } from "../../components/gutter";
import { Subtitle3 } from "../../components/typography";
import { XAxis } from "../../components/axis";
import {
  BuyButtonWhenFirstTime,
  BuyCryptoModal,
  ReceiveButtonWhenFirstTime,
} from "../main/components";
import { Modal } from "../../components/modal";
import { DepositModal } from "../main/components/deposit-modal";
import { useBuySupportServiceInfos } from "../../hooks/use-buy-support-service-infos";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconProps } from "../../components/icon/types";
import { COMMON_HOVER_OPACITY } from "../../styles/constant";

export const StakeExplorePage: FunctionComponent = observer(() => {
  const theme = useTheme();
  const intl = useIntl();

  const [searchParams] = useSearchParams();

  const [isOpenDepositModal, setIsOpenDepositModal] = React.useState(false);
  const [isOpenBuy, setIsOpenBuy] = React.useState(false);

  const buySupportServiceInfos = useBuySupportServiceInfos();

  const showBackButton = searchParams.get("showBackButton") === "true";

  return (
    <MainHeaderLayout>
      <Box paddingX="1rem" paddingY="1.25rem">
        {showBackButton ? <BackButton /> : null}

        <Gutter size="1.25rem" />

        <Box paddingX="0.25rem">
          <MainH1
            color={
              theme.mode === "light"
                ? ColorPalette["gray-700"]
                : ColorPalette["white"]
            }
          >
            {intl.formatMessage({ id: "page.stake.explore.title" })}
          </MainH1>
        </Box>

        <Gutter size="0.75rem" />

        <Box paddingX="0.25rem">
          <Subtitle3
            color={
              theme.mode === "light"
                ? ColorPalette["gray-300"]
                : ColorPalette["purple-400"]
            }
          >
            {intl.formatMessage({ id: "page.stake.explore.subtitle" })}
          </Subtitle3>
        </Box>

        <Gutter size="1.25rem" />

        <XAxis>
          <ReceiveButtonWhenFirstTime
            onClick={() => setIsOpenDepositModal(true)}
          />
          <Gutter size="0.75rem" />
          {/* Buying is not wired up for EPIX yet: the button stays visible
              but disabled until a buy provider is available. */}
          <BuyButtonWhenFirstTime onClick={() => setIsOpenBuy(true)} disabled />
        </XAxis>
      </Box>

      <Modal
        isOpen={isOpenDepositModal}
        align="bottom"
        close={() => {
          setIsOpenDepositModal(false);
        }}
        /* Simplebar를 사용하면 트랜지션이 덜덜 떨리는 문제가 있다... */
        forceNotUseSimplebar={true}
      >
        <DepositModal
          close={() => {
            setIsOpenDepositModal(false);
          }}
        />
      </Modal>

      <Modal
        isOpen={isOpenBuy}
        align="bottom"
        close={() => setIsOpenBuy(false)}
      >
        <BuyCryptoModal
          close={() => setIsOpenBuy(false)}
          buySupportServiceInfos={buySupportServiceInfos}
        />
      </Modal>
    </MainHeaderLayout>
  );
});

function BackButton() {
  const navigate = useNavigate();

  if (window.history.state && window.history.state.idx === 0) {
    return null;
  }

  return (
    <Styles.BackButtonContainer onClick={() => navigate(-1)}>
      <ArrowLeftIcon
        width="1.5rem"
        height="1.5rem"
        color={ColorPalette["gray-300"]}
      />
    </Styles.BackButtonContainer>
  );
}

const Styles = {
  BackButtonContainer: styled.div`
    cursor: pointer;
    &:hover {
      opacity: ${COMMON_HOVER_OPACITY};
    }
  `,
};

const ArrowLeftIcon: FunctionComponent<IconProps> = ({
  width,
  height,
  color,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M10.5 19.5L3 12M3 12L10.5 4.5M3 12H21"
        stroke={color || "currentColor"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
