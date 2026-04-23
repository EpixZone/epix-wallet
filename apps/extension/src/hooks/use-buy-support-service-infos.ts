import { AppCurrency } from "@keplr-wallet/types";
import { FiatOnRampServiceInfo } from "../config.ui";
import { useStore } from "../stores";

export interface BuySupportServiceInfo extends FiatOnRampServiceInfo {
  getBuyUrl: (() => Promise<string>) | undefined;
}

interface BuyUrlRequest {
  path: string;
  params: Record<string, string>;
}

type BuyUrlResponse =
  | string
  | {
      widgetUrl?: string;
      buyUrl?: string;
      signedUrl?: string;
      url?: string;
    };

const createBuyUrlRequest = (
  path: string,
  params: Record<string, string>
): BuyUrlRequest => ({
  path,
  params,
});

export const useBuySupportServiceInfos = (selectedTokenInfo?: {
  chainId: string;
  currency: AppCurrency;
}): BuySupportServiceInfo[] => {
  const { accountStore, chainStore, queriesStore } = useStore();
  const configServer = process.env["KEPLR_EXT_CONFIG_SERVER"];

  const response = queriesStore.simpleQuery.queryGet<{
    list: FiatOnRampServiceInfo[];
  }>(
    "https://raw.githubusercontent.com/chainapsis/keplr-fiat-on-off-ramp-registry/main/fiat-on-off-ramp-list.json"
  ).response;
  const fiatOnRampServiceInfos = response?.data.list;

  return (
    fiatOnRampServiceInfos
      ?.map((serviceInfo) => {
        const buySupportCoinDenoms = [
          ...new Set(
            selectedTokenInfo
              ? Object.entries(serviceInfo.buySupportCoinDenomsByChainId)
                  .filter(
                    ([chainId, coinDenoms]) =>
                      chainId === selectedTokenInfo.chainId &&
                      coinDenoms?.some((coinDenom) =>
                        coinDenom === "USDC" || coinDenom === "USDC_NOBLE"
                          ? selectedTokenInfo.currency.coinDenom.includes(
                              "USDC"
                            )
                          : coinDenom === selectedTokenInfo.currency.coinDenom
                      )
                  )
                  .map(([, coinDenoms]) => coinDenoms)
                  .flat()
              : Object.values(serviceInfo.buySupportCoinDenomsByChainId).flat()
          ),
        ];

        const selectedCoinDenom = selectedTokenInfo
          ? buySupportCoinDenoms.find((coinDenom) =>
              coinDenom === "USDC" || coinDenom === "USDC_NOBLE"
                ? selectedTokenInfo.currency.coinDenom.includes("USDC")
                : coinDenom === selectedTokenInfo.currency.coinDenom
            )
          : undefined;

        const buyUrlRequest: BuyUrlRequest | undefined = (() => {
          if (buySupportCoinDenoms.length === 0) {
            return undefined;
          }

          switch (serviceInfo.serviceId) {
            case "moonpay": {
              const walletAddresses = Object.entries(
                serviceInfo.buySupportCoinDenomsByChainId
              ).reduce((finalAcc, [chainId, coinDenoms]) => {
                if (!chainStore.hasModularChain(chainId)) {
                  return finalAcc;
                }

                const modularChainInfo = chainStore.getModularChain(chainId);
                if (
                  modularChainInfo.type !== "cosmos" &&
                  modularChainInfo.type !== "ethermint"
                ) {
                  return finalAcc;
                }

                if (!coinDenoms) {
                  return finalAcc;
                }

                return coinDenoms.reduce((acc, coinDenom) => {
                  const matchedCurrency = modularChainInfo.currencies.find(
                    (currency) => currency.coinDenom === coinDenom
                  );
                  const currencyCode = getCurrencyCodeForMoonpay(
                    matchedCurrency?.coinDenom
                  );

                  if (currencyCode) {
                    acc[currencyCode] = accountStore.getAccount(
                      modularChainInfo.chainId
                    ).bech32Address;
                  }

                  return acc;
                }, finalAcc) as Record<string, string>;
              }, {} as Record<string, string>);

              const defaultCurrencyCode = getCurrencyCodeForMoonpay(
                selectedCoinDenom ?? buySupportCoinDenoms[0]
              );

              if (
                !defaultCurrencyCode ||
                Object.keys(walletAddresses).length === 0
              ) {
                return undefined;
              }

              return createBuyUrlRequest("/api/moonpay", {
                buyOrigin: serviceInfo.buyOrigin,
                walletAddresses: JSON.stringify(walletAddresses),
                defaultCurrencyCode,
              });
            }
            case "transak": {
              const coins = Object.entries(
                serviceInfo.buySupportCoinDenomsByChainId
              ).reduce((finalAcc, [chainId, coinDenoms]) => {
                if (!chainStore.hasModularChain(chainId)) {
                  return finalAcc;
                }

                const modularChainInfo = chainStore.getModularChain(chainId);
                if (
                  modularChainInfo.type !== "cosmos" &&
                  modularChainInfo.type !== "ethermint" &&
                  modularChainInfo.type !== "evm"
                ) {
                  return finalAcc;
                }

                if (!coinDenoms) {
                  return finalAcc;
                }

                return coinDenoms.reduce((coinsAcc, coinDenom) => {
                  const matchedCurrency = modularChainInfo.currencies.find(
                    (currency) => currency.coinDenom === coinDenom
                  );

                  if (matchedCurrency) {
                    const currencyCode = matchedCurrency.coinDenom;
                    const isEvm =
                      modularChainInfo.type === "evm" ||
                      modularChainInfo.type === "ethermint";
                    coinsAcc[currencyCode] = {
                      address: isEvm
                        ? accountStore.getAccount(chainId).ethereumHexAddress
                        : accountStore.getAccount(chainId).bech32Address,
                    };
                  }

                  return coinsAcc;
                }, finalAcc) as Record<string, { address: string }>;
              }, {} as Record<string, { address: string }>);

              if (Object.keys(coins).length === 0) {
                return undefined;
              }

              const defaultCryptoCurrency =
                selectedCoinDenom ?? buySupportCoinDenoms[0];
              if (!defaultCryptoCurrency) {
                return undefined;
              }

              return createBuyUrlRequest("/api/transak", {
                walletAddressesData: JSON.stringify({ coins }),
                cryptoCurrencyList: buySupportCoinDenoms.join(","),
                defaultCryptoCurrency,
              });
            }
            case "swapped": {
              const seenCoinDenoms = new Set<string>();
              const walletAddress = Object.entries(
                serviceInfo.buySupportCoinDenomsByChainId
              )
                .reduce<string[]>((pairs, [chainId, coinDenoms]) => {
                  if (!coinDenoms || !chainStore.hasModularChain(chainId)) {
                    return pairs;
                  }

                  const modularChainInfo = chainStore.getModularChain(chainId);
                  if (modularChainInfo.type === "bitcoin") {
                    const account = accountStore.getAccount(
                      modularChainInfo.chainId
                    );
                    const coinDenom = coinDenoms[0];

                    if (
                      account.bitcoinAddress &&
                      !seenCoinDenoms.has(coinDenom)
                    ) {
                      pairs.push(
                        `${coinDenom}:${account.bitcoinAddress.bech32Address}`
                      );
                      seenCoinDenoms.add(coinDenom);
                    }

                    return pairs;
                  }

                  const isEvm =
                    modularChainInfo.type === "evm" ||
                    modularChainInfo.type === "ethermint";
                  const address = isEvm
                    ? accountStore.getAccount(chainId).ethereumHexAddress
                    : accountStore.getAccount(chainId).bech32Address;

                  coinDenoms.forEach((coinDenom) => {
                    if (!seenCoinDenoms.has(coinDenom)) {
                      pairs.push(`${coinDenom}:${address}`);
                      seenCoinDenoms.add(coinDenom);
                    }
                  });

                  return pairs;
                }, [])
                .join(",");

              if (!walletAddress) {
                return undefined;
              }

              return createBuyUrlRequest("/api/swapped", {
                buyOrigin: serviceInfo.buyOrigin,
                currencyCode: "USDC_NOBLE",
                walletAddress,
              });
            }
            default:
              return undefined;
          }
        })();

        return {
          ...serviceInfo,
          getBuyUrl:
            configServer && buyUrlRequest
              ? async () => {
                  const buyUrlQuery =
                    queriesStore.simpleQuery.queryGet<BuyUrlResponse>(
                      configServer,
                      `${buyUrlRequest.path}?${new URLSearchParams(
                        buyUrlRequest.params
                      ).toString()}`
                    );

                  await buyUrlQuery.waitFreshResponse();

                  const response = buyUrlQuery.response?.data;
                  const buyUrl =
                    typeof response === "string"
                      ? response
                      : response?.widgetUrl ??
                        response?.buyUrl ??
                        response?.signedUrl ??
                        response?.url;

                  if (!buyUrl) {
                    throw new Error(`${serviceInfo.serviceId} buyUrl is null`);
                  }

                  return buyUrl;
                }
              : undefined,
        };
      })
      .filter((serviceInfo) => serviceInfo.getBuyUrl !== undefined) ?? []
  );
};

const getCurrencyCodeForMoonpay = (coinDenom: string | undefined) => {
  if (!coinDenom) {
    return undefined;
  }

  switch (coinDenom) {
    case "DYDX":
      return "dydx_dydx";
    case "INJ":
      return "inj_inj";
    default:
      return coinDenom.toLowerCase();
  }
};
