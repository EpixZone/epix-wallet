import React, {
  FunctionComponent,
  MutableRefObject,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  SceneTransition,
  SceneTransitionRef,
  VerticalResizeTransition,
} from "../../../../components/transition";
import { Box } from "../../../../components/box";
import { YAxis } from "../../../../components/axis";
import { Body1, H4, Subtitle3 } from "../../../../components/typography";
import { useRegisterHeader } from "./context";
import { Gutter } from "../../../../components/gutter";
import { ColorPalette } from "../../../../styles";
import { RegisterH1, RegisterH4, RegisterH3 } from "../typography";
import { HelpDeskButton } from "../help-desk-button";
import { FormattedMessage, useIntl } from "react-intl";
import styled, { useTheme } from "styled-components";
import {
  ArrowLeftIcon,
  DSColor,
  DSTypography,
} from "@keplr-wallet/design-system";

const HeaderContainer = styled(Box)`
  text-align: center;
  @media screen and (max-width: 640px) {
    padding: 0.75rem 1rem 0;
    ul {
      padding-left: 1.25rem;
      text-align: left;
    }
  }
`;
const HeaderNavigation = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.75rem;
  margin-bottom: 0.75rem;
`;
const BackControl = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-height: 2.75rem;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-radius: 0.5rem;
  background: ${DSColor.fill.neutral.low};
  color: ${DSColor.typography.primary};
  cursor: pointer;
`;
const IntroLogo = styled.img`
  height: 3.125rem;
  max-width: 100%;
  object-fit: contain;
  @media screen and (max-width: 640px) {
    height: 2rem;
  }
`;

export const RegisterHeader: FunctionComponent<{
  sceneRef: MutableRefObject<SceneTransitionRef | null>;
}> = ({ sceneRef }) => {
  const headerSceneRef = useRef<SceneTransitionRef | null>(null);

  const { header } = useRegisterHeader();

  useEffect(() => {
    if (headerSceneRef.current) {
      switch (header.mode) {
        case "intro": {
          if (headerSceneRef.current.currentScene !== "intro") {
            headerSceneRef.current.replace("intro", {});
          }
          break;
        }
        case "empty": {
          if (headerSceneRef.current.currentScene !== "empty") {
            headerSceneRef.current.replace("empty", {});
          }
          break;
        }
        case "welcome": {
          if (headerSceneRef.current.currentScene !== "welcome") {
            headerSceneRef.current.replace("welcome", {
              title: header.title,
              paragraph: header.paragraph,
            });
          } else {
            headerSceneRef.current.setCurrentSceneProps({
              title: header.title,
              paragraph: header.paragraph,
            });
          }
          break;
        }
        case "step": {
          if (headerSceneRef.current.currentScene !== "step") {
            headerSceneRef.current.replace("step", {
              title: header.title,
              paragraphs: header.paragraphs,
              stepCurrent: header.stepCurrent,
              stepTotal: header.stepTotal,
            });
          } else {
            headerSceneRef.current.setCurrentSceneProps({
              title: header.title,
              paragraphs: header.paragraphs,
              stepCurrent: header.stepCurrent,
              stepTotal: header.stepTotal,
            });
          }
          break;
        }
        case "direct": {
          if (headerSceneRef.current.currentScene !== "direct") {
            headerSceneRef.current.replace("direct", {
              title: header.title,
              paragraphs: header.paragraphs,
            });
          } else {
            headerSceneRef.current.setCurrentSceneProps({
              title: header.title,
              paragraphs: header.paragraphs,
            });
          }
          break;
        }
      }
    }
  }, [header]);

  const [isBackShown, setIsBackShown] = useState(
    sceneRef.current?.canPop() ?? false
  );

  useEffect(() => {
    const listener = (stack: ReadonlyArray<string>) => {
      setIsBackShown(stack.length > 1);
    };

    const ref = sceneRef.current;
    ref?.addSceneChangeListener(listener);

    return () => {
      ref?.removeSceneChangeListener(listener);
    };
  }, [sceneRef]);

  const [currentIsEmpty, setCurrentIsEmpty] = useState(false);

  useEffect(() => {
    const listener = (stack: ReadonlyArray<string>) => {
      if (stack.length > 0 && stack[stack.length - 1] === "empty") {
        setCurrentIsEmpty(true);
      } else {
        setCurrentIsEmpty(false);
      }
    };

    const ref = headerSceneRef.current;
    ref?.addSceneChangeListener(listener);

    return () => {
      ref?.removeSceneChangeListener(listener);
    };
  }, []);

  return (
    <HeaderContainer
      position="relative"
      marginX="auto"
      width="100%"
      maxWidth="47.75rem"
    >
      {(isBackShown || header.mode !== "intro") && !currentIsEmpty ? (
        <HeaderNavigation>
          {isBackShown ? <BackButton sceneRef={sceneRef} /> : <span />}
          <HelpDeskButton />
        </HeaderNavigation>
      ) : null}
      <SceneTransition
        ref={headerSceneRef}
        scenes={[
          {
            name: "intro",
            element: HeaderIntro,
          },
          {
            name: "empty",
            element: () => null,
          },
          {
            name: "welcome",
            element: HeaderWelcome,
          },
          {
            name: "step",
            element: HeaderStep,
          },
          {
            name: "direct",
            element: HeaderDirect,
          },
        ]}
        initialSceneProps={{
          name: header.mode,
        }}
        transitionAlign="top"
        transitionMode="opacity"
      />
      {
        <VerticalResizeTransition>
          {/* bottom padding */}
          {currentIsEmpty ? null : <Gutter size="1rem" />}
        </VerticalResizeTransition>
      }
    </HeaderContainer>
  );
};

const HeaderIntro: FunctionComponent = () => {
  const theme = useTheme();

  return (
    <Box paddingY="0.25rem">
      <YAxis alignX="center">
        <IntroLogo
          src={require(theme.mode === "light"
            ? "../../../../public/assets/img/intro-logo-light.png"
            : "../../../../public/assets/img/intro-logo.png")}
          alt="Epix Wallet"
        />

        <Gutter size="0.75rem" />

        <RegisterH4
          color={
            theme.mode === "light"
              ? ColorPalette["gray-200"]
              : ColorPalette["gray-50"]
          }
        >
          <FormattedMessage id="pages.register.components.header.intro-title" />
        </RegisterH4>
      </YAxis>
    </Box>
  );
};

const HeaderWelcome: FunctionComponent<{
  title: string;
  paragraph: string;
}> = ({ title, paragraph }) => {
  const theme = useTheme();

  return (
    <Box position="relative">
      <YAxis alignX="center">
        <RegisterH1>{title}</RegisterH1>
        <Gutter size="0.75rem" />
        <H4
          color={
            theme.mode === "light"
              ? ColorPalette["gray-300"]
              : ColorPalette["gray-200"]
          }
        >
          {paragraph}
        </H4>
      </YAxis>
    </Box>
  );
};

const HeaderStep: FunctionComponent<{
  title: string;
  paragraphs?: (string | ReactNode)[];
  stepCurrent: number;
  stepTotal: number;
}> = ({ title, paragraphs, stepCurrent, stepTotal }) => {
  const intl = useIntl();
  const theme = useTheme();

  return (
    <Box position="relative">
      <YAxis alignX="center">
        {stepCurrent <= 0 || stepTotal <= 0 ? null : (
          <React.Fragment>
            <Subtitle3
              color={
                theme.mode === "light"
                  ? ColorPalette["gray-300"]
                  : ColorPalette["gray-200"]
              }
            >{`${intl.formatMessage({
              id: "pages.register.components.header.header-step.title",
            })} ${stepCurrent}/${stepTotal}`}</Subtitle3>
            <Gutter size="0.75rem" />
          </React.Fragment>
        )}

        <RegisterH3>{title}</RegisterH3>
      </YAxis>
      <Box width="100%" maxWidth="29.5rem" marginX="auto">
        <VerticalResizeTransition>
          {paragraphs && paragraphs.length > 0 ? (
            <Gutter size="1.25rem" />
          ) : null}
        </VerticalResizeTransition>
        <VerticalResizeTransition transitionAlign="top">
          {(() => {
            if (paragraphs && paragraphs.length > 0) {
              if (paragraphs.length === 1) {
                return (
                  <Body1
                    color={ColorPalette["gray-300"]}
                    style={{
                      textAlign: "center",
                    }}
                  >
                    {paragraphs[0]}
                  </Body1>
                );
              }

              return (
                <YAxis alignX="center">
                  <ul>
                    {paragraphs.map((paragraph, i) => {
                      return (
                        <Body1
                          key={i}
                          as="li"
                          color={ColorPalette["gray-300"]}
                          style={{ marginTop: i > 0 ? "0.5rem" : "0" }}
                        >
                          {paragraph}
                        </Body1>
                      );
                    })}
                  </ul>
                </YAxis>
              );
            }

            return null;
          })()}
        </VerticalResizeTransition>
      </Box>
    </Box>
  );
};

const HeaderDirect: FunctionComponent<{
  title: string;
  paragraphs?: (string | ReactNode)[];
}> = ({ title, paragraphs }) => {
  return (
    <Box position="relative">
      <YAxis alignX="center">
        <RegisterH3>{title}</RegisterH3>
      </YAxis>
      <Box width="100%" maxWidth="29.5rem" marginX="auto">
        <VerticalResizeTransition>
          {paragraphs && paragraphs.length > 0 ? (
            <Gutter size="1.25rem" />
          ) : null}
        </VerticalResizeTransition>
        <VerticalResizeTransition transitionAlign="top">
          {(() => {
            if (paragraphs && paragraphs.length > 0) {
              if (paragraphs.length === 1) {
                return (
                  <Body1
                    color={ColorPalette["gray-300"]}
                    style={{
                      textAlign: "center",
                    }}
                  >
                    {paragraphs[0]}
                  </Body1>
                );
              }

              return (
                <YAxis alignX="center">
                  <ul>
                    {paragraphs.map((paragraph, i) => {
                      return (
                        <Body1
                          key={i}
                          as="li"
                          color={ColorPalette["gray-300"]}
                          style={{ marginTop: i > 0 ? "0.5rem" : "0" }}
                        >
                          {paragraph}
                        </Body1>
                      );
                    })}
                  </ul>
                </YAxis>
              );
            }

            return null;
          })()}
        </VerticalResizeTransition>
      </Box>
    </Box>
  );
};

const BackButton: FunctionComponent<{
  sceneRef: MutableRefObject<SceneTransitionRef | null>;
}> = ({ sceneRef }) => (
  <BackControl type="button" onClick={() => sceneRef.current?.pop()}>
    <ArrowLeftIcon size={20} aria-hidden="true" />
    <DSTypography size="textSm" weight="medium">
      <FormattedMessage id="button.back" />
    </DSTypography>
  </BackControl>
);
