import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { DSColor, DSTypography } from "@keplr-wallet/design-system";
import { useIntl } from "react-intl";
import { RegisterSceneBox } from "../components/register-scene-box";
import { useRegisterHeader } from "../components/header";
import {
  useSceneEvents,
  useSceneTransition,
} from "../../../components/transition";
import { Stack } from "../../../components/stack";
import { Button } from "../../../components/button";
import { PasswordTextInput } from "../../../components/input";
import {
  isWalletTransfer,
  openWalletTransfer,
} from "../../../utils/wallet-transfer";
import { startWalletTransferScanner } from "../../../utils/wallet-transfer-scanner";

export const ImportWalletQRScene: FunctionComponent = () => {
  const intl = useIntl();
  const header = useRegisterHeader();
  const sceneTransition = useSceneTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [payload, setPayload] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const message = useCallback(
    (id: string, defaultMessage: string) =>
      intl.formatMessage({ id: `wallet-transfer.${id}`, defaultMessage }),
    [intl]
  );

  useSceneEvents({
    onWillVisible: () => {
      header.setHeader({
        mode: "step",
        title: message("import-title", "Scan desktop QR"),
        stepCurrent: 1,
        stepTotal: 3,
      });
    },
    onWillInvisible: () => {
      generation.current++;
      setActive(false);
      setPayload("");
      setPassword("");
      setIsLoading(false);
    },
  });

  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    const onVisibility = () => {
      if (document.hidden) {
        invalidate();
        setActive(false);
        setPassword("");
        setIsLoading(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      invalidate();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!active || payload || !videoRef.current) return;
    return startWalletTransferScanner(
      videoRef.current,
      (text) => {
        if (!isWalletTransfer(text)) {
          setError(
            message(
              "invalid-qr",
              "This is not an Epix Wallet transfer QR. Create one in the desktop wallet's Settings, Export to Android with QR."
            )
          );
          return false;
        }
        setPayload(text);
        setActive(false);
        setError("");
        return true;
      },
      () => {
        setActive(false);
        setError(
          message(
            "camera-error",
            "Camera unavailable. Allow EpixNet camera access in Android settings, then try again."
          )
        );
      }
    );
  }, [active, payload, message]);

  return (
    <RegisterSceneBox>
      <Stack gutter="1rem">
        <DSTypography as="p" size="textSm" color={DSColor.typography.secondary}>
          {message(
            "desktop-instructions",
            "On your desktop, select the wallet to transfer, open Settings, then Export to Android with QR. Create a transfer password and scan the QR here. Only scan a QR you created yourself."
          )}
        </DSTypography>
        {!payload ? (
          <React.Fragment>
            {active ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label={message(
                  "camera-preview",
                  "Wallet QR camera preview"
                )}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "contain",
                  borderRadius: "0.5rem",
                  background: DSColor.background.surface.scrim,
                }}
              />
            ) : null}
            {active ? (
              <DSTypography
                as="p"
                size="textSm"
                color={DSColor.typography.secondary}
              >
                {message(
                  "camera-framing",
                  "Keep the entire QR code and its white border in view. Hold steady while the camera focuses."
                )}
              </DSTypography>
            ) : null}
            <Button
              size="large"
              text={
                active
                  ? message("stop-camera", "Stop camera")
                  : message("start-camera", "Open camera")
              }
              onClick={() => {
                setError("");
                setActive(!active);
              }}
            />
          </React.Fragment>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (isLoading) return;
              const attempt = ++generation.current;
              setIsLoading(true);
              setError("");
              try {
                const account = await openWalletTransfer(payload, password);
                if (attempt !== generation.current) return;
                setPayload("");
                setPassword("");
                // Remove the scanner and its encrypted data from history before
                // collecting the receiving device's own wallet password.
                sceneTransition.replace("name-password", {
                  name: account.name,
                  ...(account.type === "mnemonic"
                    ? {
                        mnemonic: account.secret,
                        bip44Path: account.bip44Path,
                      }
                    : {
                        privateKey: {
                          value: Uint8Array.from(
                            Buffer.from(account.secret, "hex")
                          ),
                          meta: {},
                        },
                      }),
                  stepPrevious: 1,
                  stepTotal: 3,
                });
              } catch {
                if (attempt === generation.current) {
                  setError(
                    message(
                      "import-error",
                      "Could not open this transfer. Check the transfer password and both devices' clocks, or create a new QR if it expired."
                    )
                  );
                }
              } finally {
                if (attempt === generation.current) setIsLoading(false);
              }
            }}
          >
            <Stack gutter="1rem">
              <DSTypography as="p" size="textSm">
                {message(
                  "scanned",
                  "QR scanned. Enter the transfer password you chose on your desktop."
                )}
              </DSTypography>
              <PasswordTextInput
                label={message("transfer-password", "Transfer password")}
                value={password}
                autoComplete="off"
                minLength={12}
                maxLength={256}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="submit"
                size="large"
                text={message("continue", "Continue")}
                isLoading={isLoading}
                disabled={password.length < 12}
              />
              <Button
                size="large"
                color="secondary"
                text={message("rescan", "Scan again")}
                disabled={isLoading}
                onClick={() => {
                  setPayload("");
                  setPassword("");
                  setError("");
                  setActive(true);
                }}
              />
            </Stack>
          </form>
        )}
        {error ? (
          <DSTypography as="p" role="alert" size="textSm">
            {error}
          </DSTypography>
        ) : null}
      </Stack>
    </RegisterSceneBox>
  );
};
