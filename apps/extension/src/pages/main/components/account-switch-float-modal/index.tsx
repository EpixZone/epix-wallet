import React, { useCallback, useEffect, useRef, useState } from "react";
import styled, { useTheme } from "styled-components";
import SimpleBar from "simplebar-react";
import { ColorPalette } from "../../../../styles";
import { useStore } from "../../../../stores";
import { KeyInfo } from "@keplr-wallet/background";
import { observer } from "mobx-react-lite";
import { dispatchGlobalEventExceptSelf } from "../../../../utils/global-events";
import { SearchTextInput } from "../../../../components/input";
import { Gutter } from "../../../../components/gutter";
import { COMMON_HOVER_OPACITY } from "../../../../styles/constant";
import { useIntl } from "react-intl";
import { ReferenceType, UseFloatingReturn } from "@floating-ui/react-dom";
import { FloatModal } from "../../../../components/float-modal";
import { useSearchKeyInfos } from "../../../../hooks/use-search-key-infos";
import { useGetAllSortedKeyInfos } from "../../../../hooks/key-info";
import {
  SettingOutlineIcon,
  PlusStrokeIcon,
} from "../../../../components/icon";
import { Box } from "../../../../components/box";
import { useNavigate } from "react-router";
import { Stack } from "../../../../components/stack";
import { AccountItemSwitchModal } from "./account-item";

export const AccountSwitchFloatModal = observer(
  ({
    isOpen,
    closeModal,
    floating,
  }: {
    isOpen: boolean;
    closeModal: () => void;
    floating: Pick<
      UseFloatingReturn<ReferenceType>,
      "x" | "y" | "strategy" | "refs"
    >;
  }) => {
    const { keyRingStore, chainStore, uiConfigStore } = useStore();
    const [addressMap, setAddressMap] = useState<Map<string, string>>(
      new Map()
    );
    const searchInputRef = useRef<HTMLInputElement>(null);
    const intl = useIntl();
    const theme = useTheme();
    const navigate = useNavigate();
    const { searchText, setSearchText, searchedKeyInfos } = useSearchKeyInfos();

    const closeModalInner = useCallback(() => {
      setSearchText("");
      closeModal();
    }, [closeModal, setSearchText]);

    const keyInfos = searchedKeyInfos ?? keyRingStore.keyInfos;
    const sortedKeyInfos = useGetAllSortedKeyInfos(keyInfos);
    const shouldShowSearch = keyRingStore.keyInfos.length >= 7;

    useEffect(() => {
      if (isOpen && shouldShowSearch && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, [isOpen, shouldShowSearch]);

    useEffect(() => {
      (async () => {
        if (uiConfigStore.icnsInfo) {
          const keysSettled =
            await uiConfigStore.addressBookConfig.getVaultCosmosKeysSettled(
              chainStore.getModularChain(uiConfigStore.icnsInfo.chainId).chainId
            );
          const addressMap = new Map<string, string>();
          keysSettled.forEach((res) => {
            if (res.status === "fulfilled") {
              addressMap.set(res.value.vaultId, res.value.bech32Address);
            }
          });
          setAddressMap(addressMap);
        }
      })();
    }, [
      chainStore,
      uiConfigStore.addressBookConfig,
      uiConfigStore.icnsInfo,
      // 새로 추가된 계정의 bech32Address를 포함하도록
      keyRingStore.keyInfos.length,
    ]);

    const handleAccountSelect = async (keyInfo: KeyInfo) => {
      if (keyInfo.id === keyRingStore.selectedKeyInfo?.id) {
        closeModalInner();
        return;
      }

      await keyRingStore.selectKeyRing(keyInfo.id);
      await chainStore.waitSyncedEnabledChains();
      dispatchGlobalEventExceptSelf("keplr_keyring_changed");
      closeModalInner();
    };

    return (
      <React.Fragment>
        <FloatModal isOpen={isOpen} close={closeModalInner}>
          <Styles.ModalContainer
            top={floating.y ?? 0}
            left={floating.x ?? 0}
            strategy={floating.strategy}
            ref={floating.refs.setFloating}
          >
            <Styles.TitleContainer>
              <Styles.TitleText>
                {intl.formatMessage({ id: "page.wallet.title" })}
              </Styles.TitleText>
              <Box
                cursor="pointer"
                hover={{
                  opacity: COMMON_HOVER_OPACITY,
                }}
                onClick={() => {
                  closeModalInner();
                  navigate("/wallet/select");
                }}
              >
                <SettingOutlineIcon
                  width="1.5rem"
                  height="1.5rem"
                  color={
                    theme.mode === "light"
                      ? ColorPalette["gray-700"]
                      : ColorPalette["gray-10"]
                  }
                />
              </Box>
              <Box
                cursor="pointer"
                hover={{
                  opacity: COMMON_HOVER_OPACITY,
                }}
                onClick={async () => {
                  await browser.tabs.create({
                    url: "/register.html",
                  });
                }}
              >
                <PlusStrokeIcon
                  width="1.5rem"
                  height="1.5rem"
                  color={
                    theme.mode === "light"
                      ? ColorPalette["gray-700"]
                      : ColorPalette["gray-10"]
                  }
                />
              </Box>
            </Styles.TitleContainer>
            <Gutter size="0.5rem" />

            <SimpleBar
              style={{
                maxHeight: "19.75rem",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {shouldShowSearch && (
                <React.Fragment>
                  <Styles.SearchContainer>
                    <SearchTextInput
                      ref={searchInputRef}
                      value={searchText}
                      onChange={(e) => {
                        e.preventDefault();
                        setSearchText(e.target.value);
                      }}
                      placeholder="Search"
                      placeholderColor={
                        theme.mode === "dark"
                          ? ColorPalette["gray-300"]
                          : undefined
                      }
                      iconColor={
                        theme.mode === "dark"
                          ? ColorPalette["gray-300"]
                          : undefined
                      }
                      textInputContainerStyle={{
                        backgroundColor: "transparent",
                        borderRadius: "1rem",
                        minHeight: "3.75rem",
                      }}
                      inputStyle={{
                        backgroundColor: "transparent",
                        height: "3.75rem",
                      }}
                    />
                  </Styles.SearchContainer>
                  <Gutter size="0.75rem" />
                </React.Fragment>
              )}
              <Stack gutter="0.5rem">
                {sortedKeyInfos.map((keyInfo) => {
                  const isSelected =
                    keyInfo.id === keyRingStore.selectedKeyInfo?.id;
                  return (
                    <AccountItemSwitchModal
                      key={keyInfo.id}
                      keyInfo={keyInfo}
                      isSelected={isSelected}
                      onSelect={(isSelected) => {
                        if (isSelected) {
                          return;
                        }

                        handleAccountSelect(keyInfo);
                      }}
                      bech32Address={addressMap.get(keyInfo.id) ?? ""}
                    />
                  );
                })}
              </Stack>
              <Gutter size="0.5rem" />
            </SimpleBar>
          </Styles.ModalContainer>
        </FloatModal>
      </React.Fragment>
    );
  }
);

const Styles = {
  ModalContainer: styled.div<{
    top: number;
    left: number;
    strategy: string;
  }>`
    position: ${({ strategy }) => strategy ?? "absolute"};
    top: ${({ top }) => top.toString()}px;
    left: ${({ left }) => left.toString()}px;
    width: 336px;
    padding: 1rem 0.5rem 0 0.5rem;

    background-color: ${({ theme }) =>
      theme.mode === "light"
        ? ColorPalette["gray-10"]
        : ColorPalette["gray-650"]};

    border-radius: 0.75rem;
    border: 1px solid
      ${({ theme }) =>
        theme.mode === "light"
          ? ColorPalette["gray-100"]
          : ColorPalette["gray-550"]};

    display: flex;
    flex-direction: column;
  `,

  TitleContainer: styled.div`
    padding: 0.5rem 0.5rem 0.25rem 0.5rem;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;

    color: ${({ theme }) =>
      theme.mode === "light" ? ColorPalette["gray-700"] : ColorPalette.white};
  `,

  TitleText: styled.div`
    flex: 1;
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.4;
    letter-spacing: -0.14px;
    color: ${({ theme }) =>
      theme.mode === "light"
        ? ColorPalette["gray-700"]
        : ColorPalette["gray-10"]};
  `,

  SearchContainer: styled.div`
    padding: 0 0.3125rem;
    margin: 0.5rem 0;
  `,
};
