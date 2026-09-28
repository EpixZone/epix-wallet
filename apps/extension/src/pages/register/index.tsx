import { observer } from "mobx-react-lite";
import React, {
  FunctionComponent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled, { useTheme } from "styled-components";
import { ColorPalette } from "../../styles";
import {
  FixedWidthSceneTransition,
  SceneTransitionRef,
} from "../../components/transition";
import { RegisterIntroScene } from "./intro";
import { NewMnemonicScene } from "./new-mnemonic";
import { Box } from "../../components/box";
import { VerifyMnemonicScene } from "./verify-mnemonic";
import { RecoverMnemonicScene } from "./recover-mnemonic";
import { RegisterIntroNewUserScene } from "./intro-new-user";
import {
  RegisterHeader,
  RegisterHeaderProvider,
  useRegisterHeaderContext,
} from "./components/header";
import { RegisterIntroExistingUserScene } from "./intro-existing-user";
import { RegisterNamePasswordScene } from "./name-password";
import { ConnectHardwareWalletScene } from "./connect-hardware";
import { ConnectLedgerScene } from "./connect-ledger";
import { RegisterNamePasswordHardwareScene } from "./name-password-hardware";
import { FinalizeKeyScene } from "./finalize-key";
import { EnableChainsScene } from "./enable-chains";
import { SelectDerivationPathScene } from "./select-derivation-path";
import { useStore } from "../../stores";
import { useSearchParams } from "react-router-dom";
import * as KeplrWalletPrivate from "keplr-wallet-private";
import { BackUpPrivateKeyScene } from "./back-up-private-key";
import {
  ConnectKeystoneQRScene,
  ConnectKeystoneUSBScene,
} from "./connect-keystone";
import { ScanKeystoneScene } from "./connect-keystone/scan";
import {
  EpixNetworkStatusBar,
  EpixStatusBarHeight,
  useEpixStatus,
} from "../../components/epix-network";
import { bindRegisterNavigation } from "./utils/navigation";
import { fluidSceneWidth } from "./utils/scene-width";
import { Styles as ButtonStyles } from "../../components/button/styles";
import { Styles as TextButtonStyles } from "../../components/button-text/styles";
import { Styles as RadioStyles } from "../../components/radio-group/styles";

// The Tor/I2P strip spans the top of the register tab: the browser's privacy
// controls are useful before (or without) ever creating a wallet, and the
// register page is the first thing a new install shows. Fixed so it stays
// readable while the (vertically centered) scenes scroll or grow.
const StatusBarTop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  /* Above the HelpDesk/back buttons (1000) so the strip's popover and its
     tap-away backdrop are not painted under them. */
  z-index: 1001;
`;

const Container = styled.div<{ $topInset: string }>`
  --register-top-inset: ${({ $topInset }) => $topInset};
  --register-bottom-inset: 1rem;
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-top: var(--register-top-inset);
  padding-bottom: var(--register-bottom-inset);

  ${ButtonStyles.Button}, ${TextButtonStyles.Button} {
    white-space: normal;
    overflow-wrap: anywhere;
    min-height: 2.75rem;
    height: auto;
    padding: 0.75rem;
    line-height: 1.35;
  }
  ${ButtonStyles.Left}, ${ButtonStyles.Right} {
    flex-shrink: 0;
  }

  @media screen and (max-width: 640px) {
    justify-content: flex-start;

    ${RadioStyles.Container} {
      width: 100%;
      max-width: 100%;
      height: auto;
      align-items: stretch;
      padding-block: 0.25rem;
    }
    ${RadioStyles.Button} {
      flex: 1;
      min-width: 0;
      min-height: 2.75rem;
      height: auto;
      padding: 0.5rem 0.25rem;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.3;
    }
  }
`;

export const RegisterPage: FunctionComponent = observer(() => {
  const { chainStore, keyRingStore } = useStore();
  const { available: hasEpixStatusBar } = useEpixStatus();

  const isReady = useMemo(() => {
    // state 변화를 다 다루기 힘들기 때문에 미리 초기화 되어있어야만 하는 store들이 있다.
    // 매우 빠르게 초기화가 완료되기 때문에 유저는 이를 인지하기 어렵다.
    if (chainStore.isInitializing) {
      return false;
    }

    if (!keyRingStore.isInitialized) {
      return false;
    }

    if (keyRingStore.status === "locked") {
      // 잠겨있으면 애초에 먼가 잘못된거고 유저가 이상한 경로로 접근한 것이다...
      // 처리할 방법이 없으니 그냥 끈다.
      window.close();
    }

    return true;
  }, [
    chainStore.isInitializing,
    keyRingStore.isInitialized,
    keyRingStore.status,
  ]);

  // 여러번 실행될 가능성이 있는지 모르겠지만... 혹시나 해서 함
  const intervalOnce = useRef(false);
  useEffect(() => {
    if (isReady && !intervalOnce.current) {
      intervalOnce.current = true;
      setInterval(() => {
        // 위와같은 이유로 locked 상태에서는 어차피 아무것도 처리를 못한다.
        // 그러니 그냥 끈다.
        keyRingStore.fetchKeyRingStatus().then((status) => {
          if (status === "locked") {
            window.close();
          }
        });
      }, 5000);
    }
  }, [isReady, keyRingStore]);

  return (
    // The strip is fixed, so give the container matching top padding: on a
    // short window the vertically-centered content would otherwise start
    // underneath it.
    <Container $topInset={hasEpixStatusBar ? EpixStatusBarHeight : "0px"}>
      <StatusBarTop>
        <EpixNetworkStatusBar panelMode="inline" centered />
      </StatusBarTop>
      {isReady ? <RegisterPageImpl /> : null}
    </Container>
  );
});

const RegisterPageImpl: FunctionComponent = observer(() => {
  const { chainStore } = useStore();

  const sceneRef = useRef<SceneTransitionRef | null>(null);
  useEffect(() => bindRegisterNavigation(() => sceneRef.current), []);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const container = sceneContainerRef.current;
    if (!header || !container) {
      return;
    }

    // Let the intro fill the remaining viewport without assuming a fixed
    // header height: translated text and larger fonts can change it.
    const updateHeaderHeight = () => {
      container.style.setProperty(
        "--register-header-height",
        `${header.getBoundingClientRect().height}px`
      );
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const theme = useTheme();

  const [searchParams] = useSearchParams();

  const [initials] = useState(() => {
    const route = searchParams.get("route");
    const vaultId = searchParams.get("vaultId");
    const skipWelcome = searchParams.get("skipWelcome") === "true";
    const fallbackStarknetLedgerApp =
      searchParams.get("fallbackStarknetLedgerApp") === "true";
    const fallbackEthereumLedgerApp =
      searchParams.get("fallbackEthereumLedgerApp") === "true";
    const fallbackBitcoinLedgerApp =
      searchParams.get("fallbackBitcoinLedgerApp") === "true";

    if (vaultId) {
      // 이 시점에서 chainStore가 초기화 되어있는게 보장된다.
      if (chainStore.lastSyncedEnabledChainsVaultId !== vaultId) {
        // 잘못된 vaultId로 접근한 것이다.
        // 유저가 manage chains를 통해서 들어온 후에 계정을 바꾸고 이 페이지를 새로고침하면 발생할 수 있는데
        // 이 경우에는 그냥 끈다.
        // 구조상 처리하기가 너무 빡세진다.
        window.close();
      }
    }

    if (route === "enable-chains") {
      const initialSearchValue = searchParams.get("initialSearchValue");

      return {
        header: {
          // TODO: ...
          mode: "intro" as const,
        },
        scene: {
          name: "enable-chains",
          props: {
            vaultId,
            stepPrevious: -1,
            stepTotal: 0,
            skipWelcome,
            initialSearchValue,
            fallbackStarknetLedgerApp,
            fallbackEthereumLedgerApp,
            fallbackBitcoinLedgerApp,
          },
        },
      };
    }

    const chainIds = searchParams.get("chainIds");
    if (route === "select-derivation-path" && chainIds) {
      return {
        header: {
          // TODO: ...
          mode: "intro" as const,
        },
        scene: {
          name: "select-derivation-path",
          props: {
            vaultId,
            chainIds: chainIds.split(",").map((chainId) => chainId.trim()),
            totalCount: chainIds.split(",").length,
            skipWelcome,
          },
        },
      };
    }

    const ledgerApp = searchParams.get("ledgerApp");
    const account = searchParams.get("account");
    const change = searchParams.get("change");
    const addressIndex = searchParams.get("addressIndex");
    const afterEnableChains = searchParams.get("afterEnableChains");
    if (
      route === "connect-ledger" &&
      (ledgerApp === "Starknet" ||
        ledgerApp === "Ethereum" ||
        ledgerApp === "Bitcoin" ||
        ledgerApp === "Bitcoin Test")
    ) {
      return {
        header: {
          mode: "direct" as const,
        },
        scene: {
          name: "connect-ledger",
          props: {
            name: "",
            password: "",
            app: ledgerApp,
            bip44Path: {
              account,
              change,
              addressIndex,
            },
            appendModeInfo: {
              vaultId,
              // 각 ledger 앱을 연결하면 자동으로 해당 앱에 맞는 체인을 enable 한다.
              // Ethereum - mainnet
              // Starknet - mainnet
              // Bitcoin - mainnet
              // Bitcoin Test - signet, testnet
              afterEnableChains: afterEnableChains
                ? afterEnableChains.split(",").map((chainId) => chainId.trim())
                : ledgerApp === "Ethereum"
                ? ["eip155:1"]
                : ledgerApp === "Starknet"
                ? ["starknet:SN_MAIN"]
                : ledgerApp === "Bitcoin"
                ? [
                    "bip122:000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f:taproot",
                    "bip122:000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f:native-segwit",
                  ]
                : ledgerApp === "Bitcoin Test"
                ? [
                    "bip122:00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6:taproot",
                    "bip122:00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6:native-segwit",
                    "bip122:000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943:taproot",
                    "bip122:000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943:native-segwit",
                  ]
                : [],
            },
          },
        },
      };
    }

    return {
      header: {
        mode: "intro" as const,
      },
      scene: {
        name: "intro",
      },
    };
  });

  const headerContext = useRegisterHeaderContext(initials.header);

  return (
    <RegisterHeaderProvider {...headerContext}>
      <div ref={headerRef}>
        <RegisterHeader sceneRef={sceneRef} />
      </div>
      <Box
        ref={sceneContainerRef}
        position="relative"
        marginX="auto"
        backgroundColor={
          theme.mode === "light" ? ColorPalette.white : ColorPalette["gray-600"]
        }
        borderRadius="1.5rem"
        style={{
          boxShadow:
            theme.mode === "light"
              ? "0px 1px 4px 0px rgba(43, 39, 55, 0.10)"
              : "none",
        }}
      >
        <FixedWidthSceneTransition
          ref={sceneRef}
          scenes={[
            {
              name: "intro",
              element: RegisterIntroScene,
              width: fluidSceneWidth("31rem"),
            },
            {
              name: "new-user",
              element: RegisterIntroNewUserScene,
              width: fluidSceneWidth("53.75rem"),
            },
            {
              name: "existing-user",
              element: RegisterIntroExistingUserScene,
              width: fluidSceneWidth("53.75rem"),
            },
            {
              name: "new-mnemonic",
              element: NewMnemonicScene,
              width: fluidSceneWidth("33.75rem"),
            },
            {
              name: "verify-mnemonic",
              element: VerifyMnemonicScene,
              width: fluidSceneWidth("35rem"),
            },
            {
              name: "recover-mnemonic",
              element: RecoverMnemonicScene,
              width: fluidSceneWidth("33.75rem"),
            },
            {
              name: "connect-hardware-wallet",
              element: ConnectHardwareWalletScene,
              width: fluidSceneWidth("31rem"),
            },
            {
              name: "connect-ledger",
              element: ConnectLedgerScene,
              width: fluidSceneWidth("40rem"),
            },
            {
              name: "connect-keystone-qr",
              element: ConnectKeystoneQRScene,
              width: fluidSceneWidth("40rem"),
            },
            {
              name: "connect-keystone-usb",
              element: ConnectKeystoneUSBScene,
              width: fluidSceneWidth("40rem"),
            },
            {
              name: "scan-keystone",
              element: ScanKeystoneScene,
              width: fluidSceneWidth("31.25rem"),
            },
            {
              name: "back-up-private-key",
              element: BackUpPrivateKeyScene,
              width: fluidSceneWidth("28rem"),
            },
            {
              name: "name-password",
              element: RegisterNamePasswordScene,
              width: fluidSceneWidth("29rem"),
            },
            {
              name: "name-password-hardware",
              element: RegisterNamePasswordHardwareScene,
              width: fluidSceneWidth("29rem"),
            },
            {
              name: "finalize-key",
              element: FinalizeKeyScene,
              width: fluidSceneWidth("17.5rem"),
            },
            {
              name: "enable-chains",
              element: EnableChainsScene,
              width: fluidSceneWidth("34.5rem"),
            },
            {
              name: "select-derivation-path",
              element: SelectDerivationPathScene,
              width: fluidSceneWidth("40rem"),
            },
            ...KeplrWalletPrivate.RegisterScenes,
          ]}
          initialSceneProps={initials.scene}
          transitionAlign="top"
        />
      </Box>
    </RegisterHeaderProvider>
  );
});
