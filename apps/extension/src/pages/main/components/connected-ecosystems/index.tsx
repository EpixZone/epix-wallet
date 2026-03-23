import React, { FunctionComponent, useEffect, useRef } from "react";
import { SupportedPaymentType as BitcoinPaymentType } from "@keplr-wallet/types";
import { useStore } from "../../../../stores";
import { getActiveTabOrigin } from "../../../../utils/browser-api";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import {
  GetCurrentChainIdForEVMMsg,
  GetCurrentChainIdForStarknetMsg,
  GetCurrentChainIdForBitcoinMsg,
  GetPreferredBitcoinPaymentTypeMsg,
} from "@keplr-wallet/background";
import { observer } from "mobx-react-lite";
import { EcosystemSection } from "./types";
import { createBitcoinSpecificOptions } from "./utils";
import { EcosystemsSelector } from "./ecosystem-selector";

const shouldSyncConnectedEcosystemsForTabUpdate = (
  tabId: number,
  activeTabId: number | undefined,
  changeInfo: browser.tabs._OnUpdatedChangeInfo
): boolean => {
  if (activeTabId !== tabId) {
    return false;
  }

  return typeof changeInfo.url === "string" || changeInfo.status === "complete";
};

export const ConnectedEcosystems: FunctionComponent = observer(() => {
  const { chainStore, accountStore } = useStore();

  const [currentChainIdForEVM, setCurrentChainIdForEVM] = React.useState<
    string | undefined
  >();
  const [currentChainIdForStarknet, setCurrentChainIdForStarknet] =
    React.useState<string | undefined>();

  const [currentChainIdForBitcoin, setCurrentChainIdForBitcoin] =
    React.useState<string | undefined>();

  const [preferredPaymentTypeForBitcoin, setPreferredPaymentTypeForBitcoin] =
    React.useState<BitcoinPaymentType | undefined>();

  const [activeTabOrigin, setActiveTabOrigin] = React.useState<
    string | undefined
  >();

  const evmChainInfos = chainStore.modularChainInfos.filter(
    (modularChainInfo) =>
      modularChainInfo.type === "evm" || modularChainInfo.type === "ethermint"
  );

  const starknetChainInfos = chainStore.modularChainInfos.filter(
    (modularChainInfo) => modularChainInfo.type === "starknet"
  );

  const bitcoinChainInfos = chainStore.groupedModularChainInfos.filter(
    (group) => group.modularChainInfo.type === "bitcoin"
  );

  const [isOpenEcosystemSelector, setIsOpenEcosystemSelector] =
    React.useState(false);
  const [isHoveredEcosystemSelector, setIsHoveredEcosystemSelector] =
    React.useState(false);
  const latestRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const invalidateCurrentChainSync = React.useCallback(() => {
    latestRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    const requester = new InExtensionMessageRequester();

    const updateCurrentChainId = async () => {
      const requestId = ++latestRequestIdRef.current;
      const isCurrentRequest = () =>
        isMountedRef.current && requestId === latestRequestIdRef.current;

      const activeTabOrigin = await getActiveTabOrigin();

      if (!isCurrentRequest()) {
        return;
      }

      if (activeTabOrigin) {
        const msgForEVM = new GetCurrentChainIdForEVMMsg(activeTabOrigin);
        const msgForStarknet = new GetCurrentChainIdForStarknetMsg(
          activeTabOrigin
        );
        const msgForBitcoin = new GetCurrentChainIdForBitcoinMsg(
          activeTabOrigin
        );
        const msgForBitcoinPaymentType =
          new GetPreferredBitcoinPaymentTypeMsg();

        const [
          newCurrentChainIdForEVM,
          newCurrentChainIdForStarknet,
          newCurrentChainIdForBitcoin,
          newPreferredPaymentTypeForBitcoin,
        ] = await Promise.all([
          requester.sendMessage(BACKGROUND_PORT, msgForEVM),
          requester.sendMessage(BACKGROUND_PORT, msgForStarknet),
          requester.sendMessage(BACKGROUND_PORT, msgForBitcoin),
          requester.sendMessage(BACKGROUND_PORT, msgForBitcoinPaymentType),
        ]);

        if (!isCurrentRequest()) {
          return;
        }

        setCurrentChainIdForEVM(newCurrentChainIdForEVM);
        setCurrentChainIdForStarknet(newCurrentChainIdForStarknet);
        setCurrentChainIdForBitcoin(newCurrentChainIdForBitcoin);
        setPreferredPaymentTypeForBitcoin(newPreferredPaymentTypeForBitcoin);
        setActiveTabOrigin(activeTabOrigin);
      } else {
        setCurrentChainIdForEVM(undefined);
        setCurrentChainIdForStarknet(undefined);
        setCurrentChainIdForBitcoin(undefined);
        setPreferredPaymentTypeForBitcoin(undefined);
        setActiveTabOrigin(undefined);
      }
    };

    const handleTabUpdated = async (
      tabId: number,
      changeInfo: browser.tabs._OnUpdatedChangeInfo
    ) => {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const activeTabId = tabs[0]?.id;

      if (
        shouldSyncConnectedEcosystemsForTabUpdate(
          tabId,
          activeTabId,
          changeInfo
        )
      ) {
        updateCurrentChainId().catch((e) => {
          console.error(e);
        });
      }
    };

    browser.tabs.onActivated.addListener(updateCurrentChainId);
    browser.tabs.onUpdated.addListener(handleTabUpdated);
    updateCurrentChainId();
    // Update current chain id for EVM and Starknet every second.
    // TODO: Make it sync with `chainChanged` event.
    const intervalId = setInterval(updateCurrentChainId, 1000);

    return () => {
      isMountedRef.current = false;
      browser.tabs.onActivated.removeListener(updateCurrentChainId);
      browser.tabs.onUpdated.removeListener(handleTabUpdated);
      clearInterval(intervalId);
    };
  }, []);

  const ecosystemSections: Array<EcosystemSection> = [];

  if (currentChainIdForBitcoin) {
    ecosystemSections.push({
      type: "bitcoin",
      chainId: currentChainIdForBitcoin,
      chainInfos: bitcoinChainInfos.map((g) => g.modularChainInfo),
      currentChainId: currentChainIdForBitcoin,
      setCurrentChainId: setCurrentChainIdForBitcoin,
      invalidateCurrentChainSync,
      specificOptions: createBitcoinSpecificOptions(
        currentChainIdForBitcoin,
        preferredPaymentTypeForBitcoin,
        setPreferredPaymentTypeForBitcoin,
        accountStore
      ),
      footer: {
        visible: true,
      },
    });
  }

  if (currentChainIdForEVM) {
    ecosystemSections.push({
      type: "evm",
      chainId: currentChainIdForEVM,
      chainInfos: evmChainInfos,
      currentChainId: currentChainIdForEVM,
      setCurrentChainId: setCurrentChainIdForEVM,
      invalidateCurrentChainSync,
      specificOptions: undefined,
      footer: {
        visible: true,
        text: "Select an EVM-compatible chain to connect.",
      },
    });
  }

  if (currentChainIdForStarknet) {
    ecosystemSections.push({
      type: "starknet",
      chainId: currentChainIdForStarknet,
      chainInfos: starknetChainInfos,
      currentChainId: currentChainIdForStarknet,
      setCurrentChainId: setCurrentChainIdForStarknet,
      invalidateCurrentChainSync,
      specificOptions: undefined,
      footer: {
        visible: true,
        text: "Select a Starknet-compatible chain to connect.",
      },
    });
  }

  const hasConnectedEcosystems = ecosystemSections.length > 0;

  if (hasConnectedEcosystems && activeTabOrigin) {
    return (
      <EcosystemsSelector
        ecosystemSections={ecosystemSections}
        isOpen={isOpenEcosystemSelector}
        onOpenChange={setIsOpenEcosystemSelector}
        isHovered={isHoveredEcosystemSelector}
        onHoverChange={setIsHoveredEcosystemSelector}
        activeTabOrigin={activeTabOrigin}
      />
    );
  }

  return null;
});
