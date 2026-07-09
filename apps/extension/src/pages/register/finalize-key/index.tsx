import React, {
  EffectCallback,
  FunctionComponent,
  useEffect,
  useRef,
  useState,
} from "react";
import { RegisterSceneBox } from "../components/register-scene-box";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { useStore } from "../../../stores";
import { useRegisterHeader } from "../components/header";
import {
  useSceneEvents,
  useSceneTransition,
} from "../../../components/transition";
import { WalletStatus } from "@keplr-wallet/stores";
import AnimCreating from "../../../public/assets/lottie/register/creating.json";
import AnimCreatingLight from "../../../public/assets/lottie/register/creating-light.json";
import lottie from "lottie-web";
import { PlainObject } from "@keplr-wallet/background";
import { MultiAccounts } from "@keystonehq/keystone-sdk";
import { useTheme } from "styled-components";
import { dispatchGlobalEventExceptSelf } from "../../../utils/global-events";
import { INITIA_CHAIN_ID } from "../../../config.ui";

/**
 * FinalizeKeyScene is used to create the key (account).
 * You must `replaceAll()` with this scene to make a key.
 * @constructor
 */
export const FinalizeKeyScene: FunctionComponent<{
  name: string;
  password: string;
  mnemonic?: {
    value: string;
    // If mnemonic is not recovered, but newly generated,
    // it should be set to true.
    isFresh?: boolean;
    bip44Path: {
      account: number;
      change: number;
      addressIndex: number;
    };
  };
  privateKey?: {
    value: Uint8Array;
    meta: PlainObject;
  };
  ledger?: {
    pubKey: Uint8Array;
    app: string;
    bip44Path: {
      account: number;
      change: number;
      addressIndex: number;
    };
  };
  keystone?: MultiAccounts & {
    bip44Path: {
      account: number;
      change: number;
      addressIndex: number;
    };
    connectionType?: "USB" | "QR";
  };
  stepPrevious: number;
  stepTotal: number;
}> = observer(
  ({
    name,
    password,
    mnemonic,
    privateKey,
    ledger,
    keystone,
    stepPrevious,
    stepTotal,
  }) => {
    const {
      chainStore,
      accountStore,
      queriesStore,
      keyRingStore,
      priceStore,
      analyticsStore,
      starknetQueriesStore,
      bitcoinQueriesStore,
    } = useStore();

    const sceneTransition = useSceneTransition();
    const navigate = useNavigate();
    const theme = useTheme();

    const header = useRegisterHeader();
    useSceneEvents({
      onWillVisible: () => {
        header.setHeader({
          mode: "empty",
        });
      },
    });

    // Effects depends on below state and these should be called once if length > 0.
    // Thus, you should set below state only once.
    const [candidateAddresses, setCandidateAddresses] = useState<
      {
        chainId: string;
        bech32Addresses: {
          coinType: number;
          address: string;
        }[];
      }[]
    >([]);
    const [vaultId, setVaultId] = useState("");
    const [isAnimEnded, setIsAnimEnded] = useState(false);

    useEffectOnce(() => {
      (async () => {
        // Chain store should be initialized before creating the key.
        await chainStore.waitUntilInitialized();

        // background에서의 체인 정보의 변경사항 (keplr-chain-registry로부터의) 등을 sync 해야한다.
        // 사실 문제가 되는 부분은 유저가 install한 직후이다.
        // 유저가 install한 직후에 바로 register page를 열도록 background가 짜여져있기 때문에
        // 이 경우 background에서 chains service가 체인 정보를 업데이트하기 전에 register page가 열린다.
        // 그 결과 chain image가 제대로 표시되지 않는다.
        // 또한 background와 체인 정보가 맞지 않을 확률이 높기 때문에 잠재적으로도 문제가 될 수 있다.
        // 이 문제를 해결하기 위해서 밑의 한줄이 존재한다.
        await chainStore.updateChainInfosFromBackground();

        let vaultId: unknown;

        let type = "none";
        if (mnemonic) {
          type = "mnemonic";
          vaultId = await keyRingStore.newMnemonicKey(
            mnemonic.value,
            mnemonic.bip44Path,
            name,
            password
          );
        } else if (privateKey) {
          type = "privateKey";
          if (
            privateKey.meta &&
            privateKey.meta["web3Auth"] &&
            (privateKey.meta["web3Auth"] as any)["type"]
          ) {
            type = (privateKey.meta["web3Auth"] as any)["type"];
          }
          vaultId = await keyRingStore.newPrivateKeyKey(
            privateKey.value,
            privateKey.meta,
            name,
            password
          );
        } else if (ledger) {
          type = "ledger";
          vaultId = await keyRingStore.newLedgerKey(
            ledger.pubKey,
            ledger.app,
            ledger.bip44Path,
            name,
            password
          );
        } else if (keystone) {
          type = "keystone";
          vaultId = await keyRingStore.newKeystoneKey(keystone, name, password);
        } else {
          throw new Error("Invalid props");
        }

        if (typeof vaultId !== "string") {
          throw new Error("Unknown error");
        }

        analyticsStore.logEvent("account_created", {
          type,
          new_num_keyrings: keyRingStore.keyInfos.length,
        });

        await chainStore.waitSyncedEnabledChains();

        let promises: Promise<unknown>[] = [];

        for (const chainInfo of chainStore.modularChainInfos) {
          // If mnemonic is fresh, there is no way that additional coin type account has value to select.
          if (mnemonic) {
            const u = chainInfo.unwrapped;
            if (u.type !== "cosmos" && u.type !== "ethermint") {
              continue;
            }
            if (
              keyRingStore.needKeyCoinTypeFinalize(
                vaultId,
                chainInfo.chainId
              ) &&
              mnemonic?.isFresh
            ) {
              promises.push(
                (async () => {
                  await keyRingStore.finalizeKeyCoinType(
                    vaultId,
                    chainInfo.chainId,
                    u.cosmos.bip44.coinType
                  );
                })()
              );
            }
          }
        }

        dispatchGlobalEventExceptSelf("keplr_new_key_created", vaultId);

        await Promise.allSettled(promises);

        const candidateAddresses: {
          chainId: string;
          bech32Addresses: {
            coinType: number;
            address: string;
          }[];
        }[] = [];

        promises = [];
        for (const modularChainInfo of chainStore.modularChainInfos) {
          const u = modularChainInfo.unwrapped;
          if (u.type === "cosmos" || u.type === "ethermint") {
            if (
              keyRingStore.needKeyCoinTypeFinalize(
                vaultId,
                modularChainInfo.chainId
              )
            ) {
              promises.push(
                (async () => {
                  const res =
                    await keyRingStore.computeNotFinalizedKeyAddresses(
                      vaultId,
                      modularChainInfo.chainId
                    );

                  candidateAddresses.push({
                    chainId: modularChainInfo.chainId,
                    bech32Addresses: res.map((res) => {
                      return {
                        coinType: res.coinType,
                        address: res.bech32Address,
                      };
                    }),
                  });
                })()
              );
            } else {
              const account = accountStore.getAccount(modularChainInfo.chainId);
              promises.push(
                (async () => {
                  if (account.walletStatus !== WalletStatus.Loaded) {
                    await account.init();
                  }

                  if (account.bech32Address) {
                    candidateAddresses.push({
                      chainId: modularChainInfo.chainId,
                      bech32Addresses: [
                        {
                          coinType: u.cosmos.bip44.coinType,
                          address: account.bech32Address,
                        },
                      ],
                    });
                  }
                })()
              );
            }
          } else if (u.type === "evm") {
            const account = accountStore.getAccount(modularChainInfo.chainId);
            promises.push(
              (async () => {
                if (account.walletStatus !== WalletStatus.Loaded) {
                  await account.init();
                }
              })()
            );
          } else if (u.type === "starknet") {
            const account = accountStore.getAccount(modularChainInfo.chainId);
            promises.push(
              (async () => {
                if (account.walletStatus !== WalletStatus.Loaded) {
                  await account.init();
                }
              })()
            );
          } else if (u.type === "bitcoin") {
            const account = accountStore.getAccount(modularChainInfo.chainId);
            promises.push(
              (async () => {
                if (account.walletStatus !== WalletStatus.Loaded) {
                  await account.init();
                }
              })()
            );
          }
        }

        await Promise.allSettled(promises);

        setVaultId(vaultId);
        setCandidateAddresses(candidateAddresses);
      })();
    });

    useEffect(() => {
      if (candidateAddresses.length > 0) {
        // Should call once.
        (async () => {
          const promises: Promise<unknown>[] = [];

          // EVM, 스타크넷, 비트코인 관련 체인들은 `candidateAddresses`에 추가되지 않으므로 여기서 처리한다.
          for (const modularChainInfo of chainStore.modularChainInfosInListUI) {
            const mu = modularChainInfo.unwrapped;
            if (mu.type === "evm") {
              const account = accountStore.getAccount(modularChainInfo.chainId);
              const mainCurrency = mu.evm.nativeCurrency;

              if (account.ethereumHexAddress) {
                const queryBalance = queriesStore
                  .get(modularChainInfo.chainId)
                  .queryBalances.getQueryEthereumHexAddress(
                    account.ethereumHexAddress
                  );
                const balance = queryBalance.getBalance(mainCurrency);

                if (balance) {
                  promises.push(balance.waitFreshResponse());

                  if (mainCurrency.coinGeckoId) {
                    priceStore.getPrice(mainCurrency.coinGeckoId);
                  }
                }
              }
            } else if (mu.type === "starknet") {
              const account = accountStore.getAccount(modularChainInfo.chainId);
              const mainCurrency = mu.starknet.currencies[0];

              const queryBalance = starknetQueriesStore
                .get(modularChainInfo.chainId)
                .queryStarknetERC20Balance.getBalance(
                  modularChainInfo.chainId,
                  chainStore,
                  account.starknetHexAddress,
                  mainCurrency.coinMinimalDenom
                );

              if (queryBalance) {
                promises.push(queryBalance.waitFreshResponse());

                if (mainCurrency.coinGeckoId) {
                  // Push coingecko id to priceStore.
                  priceStore.getPrice(mainCurrency.coinGeckoId);
                }
              }
            } else if (mu.type === "bitcoin") {
              const account = accountStore.getAccount(modularChainInfo.chainId);
              const mainCurrency = mu.bitcoin.currencies[0];

              const queryBalance = bitcoinQueriesStore
                .get(modularChainInfo.chainId)
                .queryBitcoinBalance.getBalance(
                  modularChainInfo.chainId,
                  chainStore,
                  account.bitcoinAddress?.bech32Address ?? "",
                  mainCurrency.coinMinimalDenom
                );

              if (queryBalance) {
                promises.push(queryBalance.waitFreshResponse());

                if (mainCurrency.coinGeckoId) {
                  // Push coingecko id to priceStore.
                  priceStore.getPrice(mainCurrency.coinGeckoId);
                }
              }
            }
          }

          for (const candidateAddress of candidateAddresses) {
            const queries = queriesStore.get(candidateAddress.chainId);
            const modularChainInfo = chainStore.getModularChain(
              candidateAddress.chainId
            );
            const cu = modularChainInfo.unwrapped;
            if (cu.type !== "cosmos" && cu.type !== "ethermint") {
              continue;
            }
            for (const bech32Address of candidateAddress.bech32Addresses) {
              // Prepare queries state to avoid UI flicker on next scene.
              promises.push(
                queries.cosmos.queryAccount
                  .getQueryBech32Address(bech32Address.address)
                  .waitFreshResponse()
              );
              promises.push(
                (async () => {
                  const mainCurrency =
                    cu.cosmos.stakeCurrency || cu.cosmos.currencies[0];
                  if (!mainCurrency) return;

                  const bal = queries.queryBalances
                    .getQueryBech32Address(bech32Address.address)
                    .getBalance(mainCurrency);

                  if (bal) {
                    await bal.waitFreshResponse();
                  }
                })()
              );
              const isInitia = candidateAddress.chainId === INITIA_CHAIN_ID;
              promises.push(
                isInitia
                  ? queries.cosmos.queryInitiaDelegations
                      .getQueryBech32Address(bech32Address.address)
                      .waitFreshResponse()
                  : queries.cosmos.queryDelegations
                      .getQueryBech32Address(bech32Address.address)
                      .waitFreshResponse()
              );
            }

            const targetCurrency =
              cu.cosmos.stakeCurrency || cu.cosmos.currencies[0];
            if (targetCurrency?.coinGeckoId) {
              // Push coingecko id to priceStore.
              priceStore.getPrice(targetCurrency.coinGeckoId);
            }
          }

          // Try to make sure that prices are fresh.
          promises.push(priceStore.waitFreshResponse());

          await Promise.allSettled(promises);
        })();
      }
      // Make sure to this effect called once.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candidateAddresses]);

    // XXX: sceneTransition은 method마다 ref이 변한다.
    //      onceRef이 없으면 무한루프에 빠진다.
    //      처음에 이걸 고려 안해서 이런 문제가 생겨버렸는데
    //      수정할 시간이 없으니 일단 대충 처리한다.
    const onceRef = useRef<boolean>(false);
    useEffect(() => {
      if (
        !onceRef.current &&
        candidateAddresses.length > 0 &&
        vaultId &&
        isAnimEnded
      ) {
        onceRef.current = true;

        // Epix onboarding: for software keys the chain-picking step is
        // skipped. A new vault starts with EPIX (the first embedded chain)
        // enabled and nothing else, and EPIX's coin type is finalized at key
        // creation, so the scene would add nothing but a step. Chains can
        // still be added later (manage chain visibility reuses the
        // enable-chains scene). Hardware keys keep the scene because it also
        // drives the Ledger/Keystone app connection steps.
        const epixChainId = chainStore.modularChainInfos[0].chainId;
        if (
          (mnemonic || privateKey) &&
          !keyRingStore.needKeyCoinTypeFinalize(vaultId, epixChainId)
        ) {
          (async () => {
            await chainStore.enableChainInfoInUIWithVaultId(
              vaultId,
              epixChainId
            );
            dispatchGlobalEventExceptSelf(
              "keplr_enabled_chain_changed",
              vaultId
            );
            navigate("/welcome", {
              replace: true,
            });
          })();
          return;
        }

        sceneTransition.replace("enable-chains", {
          vaultId,
          candidateAddresses,
          isFresh: mnemonic?.isFresh ?? false,
          stepPrevious: stepPrevious,
          stepTotal: stepTotal,
        });
      }
    }, [
      candidateAddresses,
      chainStore,
      isAnimEnded,
      keyRingStore,
      mnemonic,
      navigate,
      privateKey,
      sceneTransition,
      stepPrevious,
      stepTotal,
      vaultId,
    ]);

    const animContainerRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      if (animContainerRef.current) {
        const anim = lottie.loadAnimation({
          container: animContainerRef.current,
          renderer: "svg",
          loop: false,
          autoplay: true,
          animationData:
            theme.mode === "light" ? AnimCreatingLight : AnimCreating,
        });

        // When anim ends, the scene will be replaced with next scene.
        // Animation time helps prepare queries state to avoid UI flicker on next scene.
        anim.addEventListener("complete", () => {
          setIsAnimEnded(true);
        });

        return () => {
          anim.destroy();
        };
      }
    }, []);

    return (
      <RegisterSceneBox
        style={{
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          ref={animContainerRef}
          style={{
            width: "17.5rem",
            height: "17.5rem",
          }}
        />
      </RegisterSceneBox>
    );
  }
);

const useEffectOnce = (effect: EffectCallback) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
};
