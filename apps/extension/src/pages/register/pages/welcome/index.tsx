import React, { FunctionComponent, useLayoutEffect } from "react";
import { Stack } from "../../../../components/stack";
import { Box } from "../../../../components/box";
import Color from "color";
import { ColorPalette } from "../../../../styles";
import { Columns } from "../../../../components/column";
import { Subtitle2 } from "../../../../components/typography";
import { XAxis, YAxis } from "../../../../components/axis";
import { Gutter } from "../../../../components/gutter";
import { CheckIcon, PinView, TwitterIcon } from "./components";
import { Styles } from "./styled";
import { Button } from "../../../../components/button";
import { FormattedMessage, useIntl } from "react-intl";
import { useTheme } from "styled-components";
import { closeRegistrationPage } from "../../utils/close-page";

export const WelcomePage: FunctionComponent = () => {
  const intl = useIntl();
  const theme = useTheme();
  const [isDesktop, setIsDesktop] = React.useState(true);

  useLayoutEffect(() => {
    if (window.innerWidth < 1150) {
      setIsDesktop(false);
    }

    const resizeHandler = () => {
      if (window.innerWidth < 1150) {
        setIsDesktop(false);
      } else {
        setIsDesktop(true);
      }
    };

    window.addEventListener("resize", resizeHandler);

    return () => {
      window.removeEventListener("resize", resizeHandler);
    };
  }, []);

  return (
    <Styles.Container>
      <Styles.DesktopOnly>
        <PinView />
      </Styles.DesktopOnly>

      <Stack alignX="left">
        {isDesktop ? null : (
          <React.Fragment>
            <CongratsImage size="150" />
            <Gutter size="1.25rem" />
          </React.Fragment>
        )}

        <Box
          padding="0.5rem 1rem"
          borderRadius="1.5rem"
          backgroundColor={
            theme.mode === "light"
              ? ColorPalette["green-50"]
              : Color(ColorPalette["green-600"]).alpha(0.25).toString()
          }
        >
          <Columns sum={1} gutter="0.625rem">
            <CheckIcon
              color={
                theme.mode === "light"
                  ? ColorPalette["green-500"]
                  : ColorPalette["green-400"]
              }
            />
            <Subtitle2
              color={
                theme.mode === "light"
                  ? ColorPalette["green-500"]
                  : ColorPalette["green-400"]
              }
            >
              <FormattedMessage id="pages.register.pages.welcome.sub-title" />
            </Subtitle2>
          </Columns>
        </Box>

        <Gutter size="0.75rem" />

        <Styles.ResponsiveContainer>
          {/* The column and title are clamped to the viewport (minus the
              narrow-viewport container padding) so the page fits small
              phone screens; at their design widths nothing changes. */}
          <Box width="min(37.5rem, 100vw - 2.5rem)">
            <YAxis alignX="left">
              <Box
                width="100%"
                maxWidth="31.25rem"
                style={{
                  fontWeight: 600,
                  fontSize: "clamp(1.75rem, 7vw, 3.5rem)",
                  lineHeight: 1.2,
                }}
              >
                <FormattedMessage id="pages.register.pages.welcome.title" />
              </Box>

              <Gutter size="1.25rem" />
              <Button
                text={intl.formatMessage({
                  id: "pages.register.pages.welcome.finish-button",
                })}
                size="large"
                style={{
                  width: "100%",
                  maxWidth: "22.5rem",
                  whiteSpace: "normal",
                  height: "auto",
                  minHeight: "3.25rem",
                  padding: "0.75rem",
                }}
                onClick={() => {
                  void closeRegistrationPage().catch(() => {
                    console.error("Unable to close the registration page");
                  });
                }}
              />
            </YAxis>
          </Box>

          {isDesktop ? <CongratsImage size="450" /> : null}
        </Styles.ResponsiveContainer>

        <Gutter size="1.5rem" />

        <XAxis alignY="center" wrap="wrap">
          <Box
            cursor="pointer"
            onClick={(e) => {
              e.preventDefault();

              browser.tabs.create({
                url: "https://x.com/EpixZone",
              });
            }}
          >
            <XAxis alignY="center" wrap="wrap" gap="0.5rem">
              <Box
                padding="0.375rem"
                backgroundColor={
                  theme.mode === "light"
                    ? ColorPalette["gray-300"]
                    : ColorPalette["gray-500"]
                }
                borderRadius="50%"
              >
                <TwitterIcon />
              </Box>

              <Gutter size="1rem" />

              <Box
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color:
                    theme.mode === "light"
                      ? ColorPalette["gray-300"]
                      : ColorPalette.white,
                }}
              >
                <FormattedMessage id="pages.register.pages.welcome.follow-twitter.title" />
              </Box>

              <Gutter size="1rem" />

              <Box
                width="12.5rem"
                style={{
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  color: ColorPalette["gray-200"],
                }}
              >
                <FormattedMessage id="pages.register.pages.welcome.follow-twitter.paragraph" />
              </Box>
            </XAxis>
          </Box>
        </XAxis>
      </Stack>
    </Styles.Container>
  );
};

const CongratsImage: FunctionComponent<{ size: string }> = ({ size }) => {
  const theme = useTheme();
  const src =
    theme.mode === "light"
      ? require("../../../../public/assets/img/congrats-bird-light.png")
      : require("../../../../public/assets/img/congrats-bird-dark.png");

  return (
    <Styles.CongratsImage
      src={src}
      alt="Congrats"
      style={{
        width: `${size}px`,
        aspectRatio: "1932/1800",
        borderRadius: "2.5rem",
      }}
    />
  );
};
