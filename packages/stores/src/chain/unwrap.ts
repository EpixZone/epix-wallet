import {
  AppCurrency,
  ERC20Currency,
  ModularChainInfo,
} from "@keplr-wallet/types";
import { DenomHelper } from "@keplr-wallet/common";

function toERC20Currency(currency: AppCurrency): ERC20Currency {
  if (
    "type" in currency &&
    currency.type === "erc20" &&
    "contractAddress" in currency
  ) {
    return currency as ERC20Currency;
  }
  const denomHelper = new DenomHelper(currency.coinMinimalDenom);
  return {
    ...currency,
    type: "erc20" as const,
    contractAddress: denomHelper.contractAddress,
  };
}

function isERC20Currency(currency: AppCurrency): boolean {
  if ("type" in currency) {
    return currency.type === "erc20";
  }
  return new DenomHelper(currency.coinMinimalDenom).type === "erc20";
}

function filterERC20Currencies(currencies: AppCurrency[]): ERC20Currency[] {
  return currencies.filter(isERC20Currency).map(toERC20Currency);
}

export const unwrapModularChainInfo = (
  modularChainInfo: ModularChainInfo,
  _registeredCurrencies: AppCurrency[]
): ModularChainInfo => {
  switch (modularChainInfo.type) {
    case "cosmos": {
      return {
        ...modularChainInfo,
        cosmos: {
          ...modularChainInfo.cosmos,
          currencies: modularChainInfo.cosmos.currencies
            .concat(_registeredCurrencies)
            .filter((currency) => !isERC20Currency(currency)),
        },
      };
    }
    case "ethermint": {
      return {
        ...modularChainInfo,
        cosmos: {
          ...modularChainInfo.cosmos,
          currencies: modularChainInfo.cosmos.currencies
            .concat(_registeredCurrencies)
            .filter((currency) => !isERC20Currency(currency)),
        },
        evm: {
          ...modularChainInfo.evm,
          tokens: modularChainInfo.evm.tokens.concat(
            filterERC20Currencies(_registeredCurrencies)
          ),
        },
      };
    }
    case "evm": {
      return {
        ...modularChainInfo,
        evm: {
          ...modularChainInfo.evm,
          tokens: modularChainInfo.evm.tokens.concat(
            filterERC20Currencies(_registeredCurrencies)
          ),
        },
      };
    }
    case "starknet": {
      return {
        ...modularChainInfo,
        starknet: {
          ...modularChainInfo.starknet,
          currencies: modularChainInfo.starknet.currencies.concat(
            filterERC20Currencies(_registeredCurrencies)
          ),
        },
      };
    }
    case "bitcoin": {
      return {
        ...modularChainInfo,
        bitcoin: {
          ...modularChainInfo.bitcoin,
          currencies: modularChainInfo.bitcoin.currencies.concat(
            _registeredCurrencies
          ),
        },
      };
    }
  }
};

export const getCurrencyMapFromModularChainInfo = (
  modularChainInfo: ModularChainInfo
): Map<string, AppCurrency> => {
  const currencyMap = new Map<string, AppCurrency>();

  switch (modularChainInfo.type) {
    case "cosmos":
      modularChainInfo.cosmos.currencies.forEach((currency) => {
        currencyMap.set(currency.coinMinimalDenom, currency);
      });
      break;
    case "ethermint":
      modularChainInfo.cosmos.currencies.forEach((currency) => {
        currencyMap.set(currency.coinMinimalDenom, currency);
      });
      currencyMap.set(
        modularChainInfo.evm.nativeCurrency.coinMinimalDenom,
        modularChainInfo.evm.nativeCurrency
      );
      modularChainInfo.evm.tokens.forEach((token) => {
        currencyMap.set(token.coinMinimalDenom, token);
      });
      break;
    case "evm":
      currencyMap.set(
        modularChainInfo.evm.nativeCurrency.coinMinimalDenom,
        modularChainInfo.evm.nativeCurrency
      );
      modularChainInfo.evm.tokens.forEach((token) => {
        currencyMap.set(token.coinMinimalDenom, token);
      });
      break;
    case "starknet":
      modularChainInfo.starknet.currencies.forEach((currency) => {
        currencyMap.set(currency.coinMinimalDenom, currency);
      });
      break;
    case "bitcoin":
      modularChainInfo.bitcoin.currencies.forEach((currency) => {
        currencyMap.set(currency.coinMinimalDenom, currency);
      });
      break;
  }

  return currencyMap;
};
