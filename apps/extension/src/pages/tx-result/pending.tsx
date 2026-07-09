import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useEffect, useRef } from "react";
import styled, { useTheme } from "styled-components";
import lottie from "lottie-web";
import AniPending from "../../public/assets/lottie/tx-result/pending.json";
import { Stack } from "../../components/stack";
import { Gutter } from "../../components/gutter";
import { H3, Subtitle2 } from "../../components/typography";
import { useIntl } from "react-intl";
import { ColorPalette } from "../../styles";
import { Box } from "../../components/box";
import { useSearchParams } from "react-router-dom";

export const TxResultPendingPage: FunctionComponent = observer(() => {
  const theme = useTheme();
  const isLightMode = theme.mode === "light";

  const intl = useIntl();
  const animDivRef = useRef<HTMLDivElement | null>(null);

  const [searchParams] = useSearchParams();
  const isFromEarnTransfer = searchParams.get("isFromEarnTransfer");

  // Recolor the spinner fills to the brand color of the surrounding ring
  // (cyan on dark, purple on light).
  const animationData = React.useMemo(() => {
    const color = isLightMode
      ? // purple-400 #8A4BDB
        [138 / 255, 75 / 255, 219 / 255, 1]
      : // cyan-400 #69E9F5
        [105 / 255, 233 / 255, 245 / 255, 1];

    const data = JSON.parse(JSON.stringify(AniPending));
    const walk = (node: any) => {
      if (!node || typeof node !== "object") {
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node.ty === "fl" && node.c && Array.isArray(node.c.k)) {
        node.c.k = color;
      }
      Object.values(node).forEach(walk);
    };
    walk(data);
    return data;
  }, [isLightMode]);

  useEffect(() => {
    if (animDivRef.current) {
      const anim = lottie.loadAnimation({
        container: animDivRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData,
      });

      return () => {
        anim.destroy();
      };
    }
  }, [animationData]);

  return (
    <Container isLightMode={isLightMode}>
      <Stack flex={1} alignX="center">
        <Gutter size="9.75rem" />
        <Box
          width="5rem"
          height="5rem"
          borderRadius="50%"
          borderWidth="5.246px"
          borderColor={
            isLightMode ? ColorPalette["purple-400"] : ColorPalette["cyan-400"]
          }
          position="relative"
        >
          <div
            ref={animDivRef}
            style={{
              position: "absolute",
              top: "-1.125rem",
              left: "-1.125rem",
              width: "6.5rem",
              height: "6.5rem",
            }}
          />
        </Box>
        <Gutter size="1.75rem" />
        <H3 color={isLightMode ? ColorPalette["gray-700"] : ColorPalette.white}>
          {intl.formatMessage({ id: "page.tx-result.pending.title" })}
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
                id: isFromEarnTransfer
                  ? "page.earn.transfer.amount.tx.paragraph"
                  : "page.tx-result.pending.paragraph",
              },
              {
                br: <br />,
              }
            )}
          </Subtitle2>
        </Box>
      </Stack>
    </Container>
  );
});

const Container = styled.div<{
  isLightMode: boolean;
}>`
  display: flex;
  height: 100vh;

  background: ${({ isLightMode }) => (isLightMode ? "#EFEEFA" : "#12122E")};
`;
