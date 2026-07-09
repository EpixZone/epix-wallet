import React, { FunctionComponent } from "react";
import { useTheme } from "styled-components";
import { Box } from "../../../../components/box";
import { Image } from "../../../../components/image";
import { Subtitle3 } from "../../../../components/typography";
import { ColorPalette } from "../../../../styles";
import { StakingIcon } from "../staking-icon";

export const ValidatorImage: FunctionComponent<{
  imageUrl?: string;
  name?: string;
  size?: string;
  isDelegation?: boolean;
}> = ({ imageUrl, name, size = "2rem", isDelegation }) => {
  const theme = useTheme();

  const nameFirstCharacter = (() => {
    const trimmed = name?.trim();
    if (!trimmed) {
      return undefined;
    }
    return Array.from(trimmed)[0].toUpperCase();
  })();

  return (
    <Box
      position="relative"
      width={size}
      height={size}
      style={{
        flexShrink: 0,
      }}
    >
      {imageUrl ? (
        <Image
          alt={name || "validator"}
          src={imageUrl}
          defaultSrc={require("../../../../public/assets/img/chain-icon-alt.png")}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
          }}
        />
      ) : (
        <Box
          width={size}
          height={size}
          borderRadius="50%"
          alignX="center"
          alignY="center"
          backgroundColor={
            theme.mode === "light"
              ? ColorPalette["gray-100"]
              : ColorPalette["gray-450"]
          }
        >
          <Subtitle3
            color={
              theme.mode === "light"
                ? ColorPalette["gray-400"]
                : ColorPalette["gray-200"]
            }
          >
            {nameFirstCharacter}
          </Subtitle3>
        </Box>
      )}

      {isDelegation ? (
        <Box
          position="absolute"
          width="1rem"
          height="1rem"
          borderRadius="50%"
          alignX="center"
          alignY="center"
          backgroundColor={
            theme.mode === "light"
              ? ColorPalette["gray-100"]
              : ColorPalette["gray-400"]
          }
          style={{
            bottom: "-0.1875rem",
            right: "-0.1875rem",
          }}
        >
          <StakingIcon
            width="0.6rem"
            height="0.6rem"
            color={ColorPalette["green-300"]}
          />
        </Box>
      ) : null}
    </Box>
  );
};
