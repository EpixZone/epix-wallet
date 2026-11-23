import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useEffect, useRef } from "react";
import styled, { useTheme } from "styled-components";
import lottie from "lottie-web";
import AniSuccess from "../../public/assets/lottie/tx-result/success.json";
import { Stack } from "../../components/stack";
import { Gutter } from "../../components/gutter";
import { H3, Subtitle2 } from "../../components/typography";
import { useIntl } from "react-intl";
import { ColorPalette } from "../../styles";
import { Box } from "../../components/box";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/button";

export const TxResultSuccessPage: FunctionComponent = observer(() => {
  const theme = useTheme();
  const isLightMode = theme.mode === "light";

  const intl = useIntl();
  const animDivRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (animDivRef.current) {
      const anim = lottie.loadAnimation({
        container: animDivRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: AniSuccess,
      });

      return () => {
        anim.destroy();
      };
    }
  }, []);

  return (
    <Container isLightMode={isLightMode}>
      <Stack flex={1} alignX="center">
        <Gutter size="9.75rem" />
        <div
          ref={animDivRef}
          style={{
            width: "6.5rem",
            height: "6.5rem",
            margin: "-0.75rem",
          }}
        />
        <Gutter size="1.75rem" />
        <H3 color={isLightMode ? ColorPalette["gray-700"] : ColorPalette.white}>
          {intl.formatMessage({
            id: "page.tx-result.success.title",
          })}
        </H3>
        <Gutter size="2rem" />
        <Box paddingX="1.25rem" style={{ textAlign: "center" }}>
          <Subtitle2
            color={
              isLightMode ? ColorPalette["gray-400"] : ColorPalette["gray-200"]
            }
          >
            {intl.formatMessage(
              {
                id: "page.tx-result.success.paragraph",
              },
              {
                br: <br />,
              }
            )}
          </Subtitle2>
        </Box>
        <Gutter size="2.25rem" />
        <Button
          size="large"
          onClick={() => navigate("/")}
          text={intl.formatMessage({ id: "page.tx-result.success.done" })}
          style={{ width: "18.125rem" }}
        />
      </Stack>
    </Container>
  );
});

const Container = styled.div<{
  isLightMode: boolean;
}>`
  display: flex;
  height: 100vh;

  background: ${({ isLightMode }) => (isLightMode ? "#E9FAFB" : "#0B2124")};
`;
