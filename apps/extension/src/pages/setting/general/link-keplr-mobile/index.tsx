import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { BackButton } from "../../../../layouts/header/components";
import { HeaderLayout } from "../../../../layouts/header";
import { PasswordTextInput } from "../../../../components/input";
import { Box } from "../../../../components/box";
import { Stack } from "../../../../components/stack";
import { Button } from "../../../../components/button";
import { ShowSensitiveKeyRingDataMsg } from "@keplr-wallet/background";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { QRCodeSVG } from "qrcode.react";
import { DSColor, DSTypography } from "@keplr-wallet/design-system";
import { useStore } from "../../../../stores";
import { useIntl } from "react-intl";
import {
  createWalletTransfer,
  validateTransferAccount,
} from "../../../../utils/wallet-transfer";

export const SettingGeneralLinkKeplrMobilePage: FunctionComponent = observer(
  () => {
    const { keyRingStore } = useStore();
    const account = keyRingStore.selectedKeyInfo;
    const intl = useIntl();
    const [password, setPassword] = useState("");
    const [transferPassword, setTransferPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [transfer, setTransfer] = useState<{
      qr: string;
      expiresAt: number;
    }>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    // An async export must not reveal a QR after navigation or hiding the page.
    const generation = useRef(0);
    const supported =
      account?.type === "mnemonic" || account?.type === "private-key";
    const message = useCallback(
      (id: string, defaultMessage: string) =>
        intl.formatMessage({ id: `wallet-transfer.${id}`, defaultMessage }),
      [intl]
    );

    useEffect(() => {
      const invalidate = () => {
        generation.current++;
      };
      const clear = () => {
        invalidate();
        setTransfer(undefined);
        setPassword("");
        setTransferPassword("");
        setConfirmation("");
        setIsLoading(false);
      };
      const onVisibility = () => {
        if (document.hidden) clear();
      };
      clear();
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        invalidate();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }, [account?.id]);

    useEffect(() => {
      if (!transfer) return;
      const timer = setTimeout(() => {
        setTransfer(undefined);
        setError(message("expired", "Transfer expired. Create a new QR code."));
      }, Math.max(0, transfer.expiresAt - Date.now()));
      return () => clearTimeout(timer);
    }, [transfer, message]);

    return (
      <HeaderLayout
        title={message("export-title", "Export to Android with QR")}
        left={<BackButton />}
      >
        <Box padding="1rem">
          <Stack gutter="1rem">
            <DSTypography
              as="p"
              size="textSm"
              color={DSColor.typography.secondary}
            >
              {message(
                "instructions",
                "On Android, open Epix Wallet, choose Import an existing wallet, then Scan desktop QR. Transfer one wallet at a time. No wallet data is uploaded."
              )}
            </DSTypography>
            <DSTypography size="textMd" weight="semibold">
              {account?.name}
            </DSTypography>
            {!supported ? (
              <DSTypography as="p" size="textSm">
                {message(
                  "unsupported",
                  "Select a recovery phrase or private key wallet to export. Hardware wallets must be connected separately on Android."
                )}
              </DSTypography>
            ) : transfer ? (
              <React.Fragment>
                <DSTypography as="p" size="textSm">
                  {message(
                    "scan-instructions",
                    "Scan this QR with Epix Wallet on Android and enter your transfer password there. It expires after 5 minutes. Keep the QR and password private."
                  )}
                </DSTypography>
                <Box
                  padding="1rem"
                  backgroundColor={DSColor.white}
                  borderRadius="0.5rem"
                  style={{ alignSelf: "center", maxWidth: "100%" }}
                >
                  <QRCodeSVG
                    value={transfer.qr}
                    size={280}
                    level="M"
                    style={{ width: "100%", height: "auto" }}
                  />
                </Box>
                <Button
                  text={message("hide", "Hide QR code")}
                  size="large"
                  color="secondary"
                  onClick={() => setTransfer(undefined)}
                />
              </React.Fragment>
            ) : (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (
                    !account ||
                    !supported ||
                    isLoading ||
                    !password ||
                    transferPassword.length < 12 ||
                    transferPassword !== confirmation
                  )
                    return;
                  setError("");
                  if (transferPassword === password) {
                    setError(
                      message(
                        "different-password",
                        "Choose a transfer password different from your wallet password."
                      )
                    );
                    return;
                  }
                  const attempt = ++generation.current;
                  setIsLoading(true);
                  try {
                    const secret =
                      await new InExtensionMessageRequester().sendMessage(
                        BACKGROUND_PORT,
                        new ShowSensitiveKeyRingDataMsg(account.id, password)
                      );
                    const payload = validateTransferAccount({
                      type: account.type,
                      name: account.name,
                      secret,
                      bip44Path: account.insensitive["bip44Path"],
                    });
                    const result = await createWalletTransfer(
                      payload,
                      transferPassword
                    );
                    if (attempt === generation.current) setTransfer(result);
                  } catch {
                    if (attempt === generation.current) {
                      setError(
                        message(
                          "export-error",
                          "Could not create a transfer. Check your wallet password and try again."
                        )
                      );
                    }
                  } finally {
                    if (attempt === generation.current) {
                      setPassword("");
                      setTransferPassword("");
                      setConfirmation("");
                      setIsLoading(false);
                    }
                  }
                }}
              >
                <Stack gutter="1rem">
                  <PasswordTextInput
                    label={message("wallet-password", "Wallet password")}
                    value={password}
                    autoComplete="current-password"
                    maxLength={256}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <DSTypography
                    as="p"
                    size="textSm"
                    color={DSColor.typography.secondary}
                  >
                    {message(
                      "password-help",
                      "Choose a unique transfer password of at least 12 characters, such as several random words. You will enter it on Android. It does not change your wallet password."
                    )}
                  </DSTypography>
                  <PasswordTextInput
                    label={message("transfer-password", "Transfer password")}
                    value={transferPassword}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    onChange={(e) => setTransferPassword(e.target.value)}
                  />
                  <PasswordTextInput
                    label={message(
                      "confirm-password",
                      "Confirm transfer password"
                    )}
                    value={confirmation}
                    autoComplete="new-password"
                    maxLength={256}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  <Button
                    type="submit"
                    text={message("create", "Create QR code")}
                    size="large"
                    isLoading={isLoading}
                    disabled={
                      !password ||
                      transferPassword.length < 12 ||
                      transferPassword !== confirmation
                    }
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
        </Box>
      </HeaderLayout>
    );
  }
);
