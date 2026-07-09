import React, {
  FunctionComponent,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import { SpecialButtonProps } from "./types";
import { Styles } from "./styles";
import { LoadingIcon } from "../icon";
import { Box } from "../box";
import { ColorPalette } from "../../styles";
import { to, useSpringValue } from "@react-spring/web";

const springConfig = {
  mass: 0.6,
  tension: 270,
  friction: 21,
};

const backgroundSpringConfig = {
  mass: 0.6,
  tension: 220,
  friction: 15,
};

const onClickSpringConfig = {
  mass: 0.6,
  tension: 320,
  friction: 10,
};

const defaultBackgroundColor = ColorPalette["purple-400"];
const hoverBackgroundColor = ColorPalette["purple-300"];

const defaultBoxShadowColor = "#69e9f580";
const hoverBoxShadowColor = "#69e9f580";
const pressedBoxShadowColor = "#69e9f580";

const defaultBoxShadowStrength = 0;
const hoverBoxShadowStrength = 11;
const pressedBoxShadowStrength = 0;

const defaultScale = 1;
const hoverScale = 1.03;
const pressedScale = 0.98;

export const SpecialButton: FunctionComponent<SpecialButtonProps> = ({
  size,
  onClick,
  left,
  text,
  right,
  isLoading,
  suppressDefaultLoadingIndicator,
  showTextWhileLoading,
  disabled,
  textOverrideIcon,
}) => {
  const backgroundColor = useSpringValue(defaultBackgroundColor);

  const boxShadowColor = useSpringValue(defaultBoxShadowColor);

  const boxShadowStrength = useSpringValue(defaultBoxShadowStrength);

  const scale = useSpringValue(defaultScale);

  const [isHover, setIsHover] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const animateToDefault = useCallback(() => {
    return Promise.all([
      backgroundColor.start(defaultBackgroundColor, {
        config: backgroundSpringConfig,
      }),
      scale.start(defaultScale, {
        config: springConfig,
      }),
      boxShadowColor.start(defaultBoxShadowColor, {
        config: springConfig,
      }),
      boxShadowStrength.start(defaultBoxShadowStrength, {
        config: springConfig,
      }),
    ]);
    // 이 함수는 lifecycle내에서 constant하고 그게 보장이 되어야함.
  }, [backgroundColor, boxShadowColor, boxShadowStrength, scale]);

  useLayoutEffect(() => {
    if (disabled) {
      animateToDefault();
    }
  }, [animateToDefault, disabled]);

  useLayoutEffect(() => {
    if (disabled) {
      return;
    }

    if (isHover) {
      backgroundColor.start(hoverBackgroundColor, {
        config: backgroundSpringConfig,
      });

      scale.start(hoverScale, {
        config: springConfig,
      });
      boxShadowColor.start(hoverBoxShadowColor, {
        config: springConfig,
      });
      boxShadowStrength.start(hoverBoxShadowStrength, {
        config: springConfig,
      });
    } else {
      animateToDefault();
    }
  }, [
    animateToDefault,
    backgroundColor,
    boxShadowColor,
    boxShadowStrength,
    disabled,
    isHover,
    scale,
  ]);

  useLayoutEffect(() => {
    if (disabled) {
      return;
    }

    if (isPressed) {
      backgroundColor.start(hoverBackgroundColor, {
        config: backgroundSpringConfig,
      });

      scale.start(pressedScale, {
        config: springConfig,
      });
      boxShadowColor.start(pressedBoxShadowColor, {
        config: springConfig,
      });
      boxShadowStrength.start(pressedBoxShadowStrength, {
        config: springConfig,
      });
    }
  }, [
    backgroundColor,
    boxShadowColor,
    boxShadowStrength,
    disabled,
    isPressed,
    scale,
  ]);

  return (
    <Styles.Container>
      <Styles.Button
        size={size}
        isLoading={isLoading}
        disabled={disabled}
        type="button"
        onClick={() => {
          if (disabled || isLoading) {
            return;
          }

          setIsPressed(false);

          backgroundColor.start(defaultBackgroundColor, {
            config: backgroundSpringConfig,
          });

          scale.start(defaultScale, {
            config: onClickSpringConfig,
          });
          boxShadowColor.start(defaultBoxShadowColor, {
            config: onClickSpringConfig,
          });
          boxShadowStrength.start(defaultBoxShadowStrength, {
            config: onClickSpringConfig,
          });

          if (onClick) {
            onClick();
          }
        }}
        onMouseOver={() => setIsHover(true)}
        onMouseOut={() => {
          setIsHover(false);
          // 외부에서 마우스가 up 되었을 경우 event가 발생하지 않으므로 여기서도 처리해준다.
          setIsPressed(false);
        }}
        onMouseDown={() => {
          if (isLoading) {
            return;
          }

          setIsPressed(true);
        }}
        style={{
          background: backgroundColor,
          transform: to(scale, (s) => `scale(${s})`),
          boxShadow: to(
            [boxShadowColor, boxShadowStrength],
            (c, s) => `0px 0px ${s}px ${c}`
          ),
        }}
      >
        {left ? <Styles.Left>{left}</Styles.Left> : null}

        {isLoading && !suppressDefaultLoadingIndicator ? (
          <Styles.Loading>
            <LoadingIcon width="1rem" height="1rem" />
          </Styles.Loading>
        ) : null}

        {!isLoading && textOverrideIcon ? (
          <Styles.TextOverrideIcon>{textOverrideIcon}</Styles.TextOverrideIcon>
        ) : null}

        <Box
          style={{
            opacity:
              (isLoading && !showTextWhileLoading) || textOverrideIcon ? 0 : 1,
          }}
        >
          {text}
        </Box>

        {right ? <Styles.Right>{right}</Styles.Right> : null}
      </Styles.Button>
    </Styles.Container>
  );
};
