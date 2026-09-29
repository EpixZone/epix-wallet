import React, { FunctionComponent, useEffect, useRef } from "react";
import { Button } from "../../../components/button";
import {
  useSceneEvents,
  useSceneTransition,
} from "../../../components/transition";
import { useRegisterHeader } from "../components/header";
import styled from "styled-components";
import { TextButton } from "../../../components/button-text";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { useIntl } from "react-intl";
import lottie from "lottie-web";
import AnimIntro from "../../../public/assets/lottie/register/intro.json";

const IntroLayout = styled.div`
  display: flex;
  flex-direction: column;
  min-height: calc(
    100vh - var(--register-header-height, 0px) - var(--register-top-inset) -
      var(--register-bottom-inset)
  );
  min-height: calc(
    100dvh - var(--register-header-height, 0px) - var(--register-top-inset) -
      var(--register-bottom-inset)
  );
  padding: 1rem 3.25rem;
  gap: 0.75rem;

  @media screen and (max-width: 480px) {
    padding-inline: 1.25rem;
  }
`;

const IntroIllustration = styled.div`
  position: relative;
  flex: 1 0 3rem;
  width: 100%;
  max-width: 25rem;
  align-self: center;

  /* The SVG keeps its aspect ratio inside the space left by the actions.
     Taking it out of flow lets it shrink before any button needs to scroll. */
  > svg {
    position: absolute;
    inset: 0;
  }
`;

const IntroActions = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 0.75rem;
`;

export const RegisterIntroScene: FunctionComponent = observer(() => {
  const { uiConfigStore } = useStore();
  const sceneTransition = useSceneTransition();
  const intl = useIntl();

  const header = useRegisterHeader();
  useSceneEvents({
    onWillVisible: () => {
      header.setHeader({
        mode: "intro",
      });
    },
  });

  const animContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (animContainerRef.current) {
      const anim = lottie.loadAnimation({
        container: animContainerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: AnimIntro,
      });
      return () => {
        anim.destroy();
      };
    }
  }, []);

  return (
    <IntroLayout>
      <IntroIllustration ref={animContainerRef} aria-hidden="true" />
      <IntroActions>
        <Button
          text={intl.formatMessage({
            id: "pages.register.intro.create-wallet-button",
          })}
          size="large"
          onClick={() => {
            sceneTransition.push("new-user");
          }}
        />
        <Button
          text={intl.formatMessage({
            id: "pages.register.intro.import-wallet-button",
          })}
          size="large"
          color="secondary"
          onClick={() => {
            sceneTransition.push("existing-user");
          }}
        />
        <TextButton
          text={intl.formatMessage({
            id: "wallet-transfer.import-title",
            defaultMessage: "Scan desktop QR",
          })}
          size="large"
          onClick={() => sceneTransition.push("import-wallet-qr")}
        />
        {uiConfigStore.platform !== "firefox" ? (
          <TextButton
            text={intl.formatMessage({
              id: "pages.register.intro.connect-hardware-wallet-button",
            })}
            size="large"
            onClick={() => {
              sceneTransition.push("connect-hardware-wallet");
            }}
          />
        ) : null}
      </IntroActions>
    </IntroLayout>
  );
});
