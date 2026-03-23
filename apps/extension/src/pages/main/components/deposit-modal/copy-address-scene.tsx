import React, { Fragment, FunctionComponent, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { FormattedMessage, useIntl } from "react-intl";
import { useTheme } from "styled-components";
import { useFocusOnMount } from "../../../../hooks/use-focus-on-mount";
import { Box } from "../../../../components/box";
import { ColorPalette } from "../../../../styles";
import { Subtitle1, Subtitle4 } from "../../../../components/typography";
import { Gutter } from "../../../../components/gutter";
import { SearchTextInput } from "../../../../components/input";
import SimpleBar from "simplebar-react";
import { ArrowRightSolidIcon } from "../../../../components/icon";
import {
  useSceneEvents,
  useSceneTransition,
} from "../../../../components/transition";
import { ChainInfo, SupportedPaymentType } from "@keplr-wallet/types";
import { IModularChainInfoImpl } from "@keplr-wallet/stores";
import { isRunningInSidePanel } from "../../../../utils";
import { useGetSearchChains } from "../../../../hooks/use-get-search-chains";
import { LookingForChainItem } from "../looking-for-chains";
import { useSearch } from "../../../../hooks/use-search";
import { Column, Columns } from "../../../../components/column";
import { TextButton } from "../../../../components/button-text";
import { useBuySupportServiceInfos } from "../../../../hooks/use-buy-support-service-infos";
import { useGetAddressesOnCopyAddress } from "../../hooks/use-get-addresses-copy-address";
import { NoResultBox } from "../deposit-modal-no-search-box";
import {
  CopyAddressItemList,
  EnterTag,
} from "../copy-address-item/copy-address-item-list";
import { useInitialChunkedRender } from "../../../../hooks/use-initial-chunked-render";
import { FadeInContainer } from "../copy-address-item/fade-in-container";
import { isChainSupportedByKeyType } from "../../../../utils/is-chain-supported-by-key-type";

export type Address = {
  modularChainInfo: IModularChainInfoImpl;
  bech32Address?: string;
  ethereumAddress?: string;
  starknetAddress?: string;
  bitcoinAddress?: {
    bech32Address: string;
    paymentType: SupportedPaymentType;
  };
};

const chainSearchFields = [
  "chainInfo.chainName",
  "chainInfo.chainId",
  {
    key: "ethereum-and-bitcoin",
    function: (item: { chainInfo: { chainName: string } }) => {
      if (item.chainInfo.chainName.toLowerCase().includes("ethereum")) {
        return "eth";
      }
      if (item.chainInfo.chainName.toLowerCase().includes("bitcoin")) {
        return "btc";
      }
      return "";
    },
  },
];

export const CopyAddressScene: FunctionComponent<{
  close: () => void;
  initialSearch?: string;
}> = observer(({ close, initialSearch }) => {
  const { chainStore, keyRingStore } = useStore();

  const intl = useIntl();
  const theme = useTheme();
  const [search, setSearch] = useState(initialSearch ?? "");
  const runInSidePanel = isRunningInSidePanel();

  const searchRef = useFocusOnMount<HTMLInputElement>();
  const sceneTransition = useSceneTransition();
  const buySupportServiceInfos = useBuySupportServiceInfos();
  const [showEnterTag, setShowEnterTag] = useState(false);

  useSceneEvents({
    onDidVisible: () => {
      if (searchRef.current) {
        // XXX: Scene transition 컴포넌트가 최초 scene의 경우 onDidVisible를 발생 못시키는 문제가 있다.
        //      이 문제 때문에 그냥 mount일때와 onDidVisible일때 모두 focus를 준다.
        searchRef.current.focus();
      }
    },
  });

  const { sortedAddresses, setSortPriorities } =
    useGetAddressesOnCopyAddress(search);

  const { visibleItems, isVisible, isInitialRenderDone } =
    useInitialChunkedRender(sortedAddresses);

  const [blockInteraction, setBlockInteraction] = useState(false);

  const initialLookingForChains = useMemo(
    () =>
      chainStore.groupedModularChainInfosInListUI
        .filter(
          (group) =>
            !chainStore.isEnabledChain(group.modularChainInfo.chainId) &&
            isChainSupportedByKeyType(
              keyRingStore.selectedKeyInfo?.type,
              group.modularChainInfo
            )
        )
        .map((group) => ({
          chainId: group.modularChainInfo.chainId,
          chainName: group.modularChainInfo.chainName,
          chainSymbolImageUrl: group.modularChainInfo.chainSymbolImageUrl,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      chainStore.groupedModularChainInfosInListUI,
      keyRingStore.selectedKeyInfo?.type,
    ]
  );

  const { searchedChainInfos } = useGetSearchChains({
    search,
    searchOption: "all",
    filterOption: "chain",
    initialChainInfos: initialLookingForChains,
    minSearchLength: 1,
  });

  const lookingForChains = useMemo(() => {
    const disabledChainInfos = searchedChainInfos
      .filter((chainInfo) => !chainStore.isEnabledChain(chainInfo.chainId))
      .sort((a, b) => a.chainName.localeCompare(b.chainName));

    return disabledChainInfos.reduce(
      (acc, chainInfo) => {
        let embedded: boolean | undefined = false;
        let stored: boolean = true;

        if (!chainStore.hasModularChain(chainInfo.chainId)) {
          embedded = undefined;
          stored = false;
        } else {
          const modularChainInfo = chainStore.getModularChain(
            chainInfo.chainId
          );

          if (modularChainInfo.hideInUI) {
            return acc;
          }

          stored = true;
          embedded = modularChainInfo.embedded.isBuiltInChain;
        }

        const chainItem = {
          embedded: !!embedded,
          stored,
          chainInfo,
        };

        acc.push(chainItem);

        return acc;
      },
      [] as {
        embedded: boolean;
        stored: boolean;
        chainInfo: {
          chainId: string;
          chainName: string;
          chainSymbolImageUrl?: string;
          suggestChainInfo?: ChainInfo;
        };
      }[]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedChainInfos, chainStore, chainStore.modularChainInfosInUI]);

  const searchedLookingForChains = useSearch(
    lookingForChains,
    search,
    chainSearchFields
  );

  const hasAddresses = sortedAddresses.length > 0;
  const hasLookingForChains = searchedLookingForChains.length > 0;
  const isShowNoResult = !(hasAddresses || hasLookingForChains);

  return (
    <Box
      paddingTop="1.25rem"
      backgroundColor={
        theme.mode === "light" ? ColorPalette.white : ColorPalette["gray-600"]
      }
      height={runInSidePanel ? "70vh" : undefined}
    >
      <Columns sum={1} style={{ padding: "0 1rem" }} alignY="center">
        <Gutter size="0.5rem" />
        <Subtitle1
          color={
            theme.mode === "light"
              ? ColorPalette["gray-700"]
              : ColorPalette.white
          }
        >
          <FormattedMessage id="page.main.components.deposit-modal.title" />
        </Subtitle1>
        <Column weight={1} />
        <TextButton
          text={intl.formatMessage({
            id: "page.main.components.deposit-modal.buy-crypto-button",
          })}
          color="blue"
          onClick={() => {
            sceneTransition.push("buy-crypto", {
              buySupportServiceInfos,
              showBackButton: true,
              close,
            });
          }}
          right={
            <ArrowRightSolidIcon
              width="1rem"
              height="1rem"
              color={ColorPalette["blue-400"]}
            />
          }
          style={{
            margin: "0.5rem -0.75rem",
          }}
        />
      </Columns>

      <Gutter size="0.75rem" />

      <Box paddingX="0.75rem">
        <SearchTextInput
          ref={searchRef}
          value={search}
          onChange={(e) => {
            e.preventDefault();

            setSearch(e.target.value);
          }}
          placeholder={
            showEnterTag
              ? ""
              : intl.formatMessage({
                  id: "page.main.components.deposit-modal.search-placeholder",
                })
          }
          suffix={showEnterTag ? <EnterTag /> : undefined}
        />
      </Box>

      <Gutter size="0.75rem" />

      <SimpleBar
        style={{
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          height: runInSidePanel ? "" : "21.5rem",
        }}
      >
        {isVisible ? (
          <FadeInContainer>
            {isShowNoResult && <NoResultBox />}

            <CopyAddressItemList
              containerStyle={{
                padding: "0 1.125rem",
              }}
              sortedAddresses={visibleItems}
              close={close}
              blockInteraction={blockInteraction}
              setBlockInteraction={setBlockInteraction}
              setSortPriorities={setSortPriorities}
              search={search}
              onClickIcon={(address: Address) => {
                sceneTransition.push("qr-code", {
                  chainId: address.modularChainInfo.chainId,
                  address:
                    address.starknetAddress ||
                    address.ethereumAddress ||
                    address.bech32Address ||
                    address.bitcoinAddress?.bech32Address,
                  close,
                });
              }}
              setShowEnterTag={setShowEnterTag}
            />

            {isInitialRenderDone && (
              <Fragment>
                {hasAddresses && hasLookingForChains && (
                  <Gutter size="1.25rem" />
                )}
                {hasLookingForChains && (
                  <Box paddingX="0.75rem">
                    <Subtitle4
                      color={
                        theme.mode === "light"
                          ? ColorPalette["gray-500"]
                          : ColorPalette["gray-200"]
                      }
                    >
                      <FormattedMessage id="page.main.components.deposit-modal.look-for-chains" />
                    </Subtitle4>
                    {searchedLookingForChains.map((chainData) => {
                      return (
                        <React.Fragment key={chainData.chainInfo.chainId}>
                          <Gutter size="0.75rem" />
                          <LookingForChainItem
                            chainInfo={chainData.chainInfo}
                            stored={chainData.stored}
                            embedded={chainData.embedded}
                          />
                        </React.Fragment>
                      );
                    })}
                  </Box>
                )}
                <Gutter size="0.75rem" />
              </Fragment>
            )}
          </FadeInContainer>
        ) : null}
      </SimpleBar>
    </Box>
  );
});
