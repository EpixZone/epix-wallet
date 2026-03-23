import { Dec } from "@keplr-wallet/unit";
import { EthereumQueriesImpl } from "@keplr-wallet/stores-eth";
import { FeeType } from "./types";

// --- Constants ---
export const GWEI = new Dec(10 ** 9);
export const ETH_FEE_HISTORY_BLOCK_COUNT = 20;
export const ETH_FEE_HISTORY_REWARD_PERCENTILES = [20, 40, 60];
export const MAX_PRIORITY_FEE_UPPER_BOUND = new Dec(20).mul(GWEI);
export const MAX_PRIORITY_FEE_UPPER_BOUND_FOR_POLYGON = new Dec(100).mul(GWEI);
export const ETH_FEE_SETTINGS_BY_FEE_TYPE: Record<
  FeeType,
  {
    percentile: number;
    baseFeePercentageMultiplier: Dec;
  }
> = {
  low: {
    percentile: ETH_FEE_HISTORY_REWARD_PERCENTILES[0],
    baseFeePercentageMultiplier: new Dec(1),
  },
  average: {
    percentile: ETH_FEE_HISTORY_REWARD_PERCENTILES[1],
    baseFeePercentageMultiplier: new Dec(1.25),
  },
  high: {
    percentile: ETH_FEE_HISTORY_REWARD_PERCENTILES[2],
    baseFeePercentageMultiplier: new Dec(1.5),
  },
};
export const ETH_FEE_HISTORY_NEWEST_BLOCK = "latest";

// --- Result Type ---
export type EIP1559TxFees = {
  maxPriorityFeePerGas?: Dec;
  maxFeePerGas?: Dec;
  gasPrice?: Dec;
};

// --- Pure Functions ---

export function getMaxPriorityFeeUpperBound(chainId: string): Dec {
  return chainId === "eip155:137"
    ? MAX_PRIORITY_FEE_UPPER_BOUND_FOR_POLYGON
    : MAX_PRIORITY_FEE_UPPER_BOUND;
}

export function calculateOptimalMaxPriorityFeePerGas(
  ethereumQueries: EthereumQueriesImpl,
  feeType: FeeType,
  chainId: string
): Dec {
  const feeHistoryQuery =
    ethereumQueries.queryEthereumFeeHistory.getQueryByFeeHistoryParams(
      ETH_FEE_HISTORY_BLOCK_COUNT,
      ETH_FEE_HISTORY_NEWEST_BLOCK,
      ETH_FEE_HISTORY_REWARD_PERCENTILES
    );

  const reasonableMaxPriorityFeePerGas =
    feeHistoryQuery.reasonableMaxPriorityFeePerGas;
  const maxPriorityFeePerGas =
    ethereumQueries.queryEthereumMaxPriorityFee.maxPriorityFeePerGas;

  if (
    reasonableMaxPriorityFeePerGas &&
    reasonableMaxPriorityFeePerGas.length > 0
  ) {
    const percentile = ETH_FEE_SETTINGS_BY_FEE_TYPE[feeType].percentile;
    const targetPercentileData = reasonableMaxPriorityFeePerGas.find(
      (item) => item.percentile === percentile
    );

    if (targetPercentileData) {
      const historyBasedFee = new Dec(targetPercentileData.value);
      const networkSuggestedFee = new Dec(
        BigInt(maxPriorityFeePerGas ?? "0x0")
      );

      const higherFee = historyBasedFee.gt(networkSuggestedFee)
        ? historyBasedFee
        : networkSuggestedFee;

      const upperBound = getMaxPriorityFeeUpperBound(chainId);

      if (higherFee.gt(upperBound)) {
        return upperBound;
      }

      return higherFee;
    }
  }

  if (maxPriorityFeePerGas) {
    const multiplier =
      ETH_FEE_SETTINGS_BY_FEE_TYPE[feeType].baseFeePercentageMultiplier;
    return new Dec(BigInt(maxPriorityFeePerGas)).mul(multiplier);
  }

  return new Dec(0);
}

// --- Query UI State ---
export type EIP1559QueryUIState = {
  warning?: Error;
  isLoading: boolean;
  isBlocked: boolean;
};

export function getEIP1559QueryUIState(
  ethereumQueries: EthereumQueriesImpl,
  chainId: string
): EIP1559QueryUIState {
  let warning: Error | undefined;
  let isLoading = false;

  const blockQuery =
    ethereumQueries.queryEthereumBlock.getQueryByBlockNumberOrTag(
      ETH_FEE_HISTORY_NEWEST_BLOCK
    );
  if (blockQuery.error) {
    warning = new Error(`Failed to fetch latest block. chain id: ${chainId}`);
  }
  if (blockQuery.isFetching) {
    isLoading = true;
  }
  if (!blockQuery.response) {
    return { warning, isLoading, isBlocked: true };
  }

  const feeHistoryQuery =
    ethereumQueries.queryEthereumFeeHistory.getQueryByFeeHistoryParams(
      ETH_FEE_HISTORY_BLOCK_COUNT,
      ETH_FEE_HISTORY_NEWEST_BLOCK,
      ETH_FEE_HISTORY_REWARD_PERCENTILES
    );
  const maxPriorityFeePerGasQuery = ethereumQueries.queryEthereumMaxPriorityFee;

  if (feeHistoryQuery.error && maxPriorityFeePerGasQuery.error) {
    warning = new Error(
      `Failed to fetch both fee history and max priority fee. chain id: ${chainId}`
    );
  }
  if (feeHistoryQuery.isFetching || maxPriorityFeePerGasQuery.isFetching) {
    isLoading = true;
  }
  if (!feeHistoryQuery.response || !maxPriorityFeePerGasQuery.response) {
    return { warning, isLoading, isBlocked: true };
  }

  const gasPriceQuery = ethereumQueries.queryEthereumGasPrice;
  if (gasPriceQuery.error) {
    warning = new Error(`Failed to fetch gas price. chain id: ${chainId}`);
  }
  if (gasPriceQuery.isFetching) {
    isLoading = true;
  }
  if (!gasPriceQuery.response) {
    return { warning, isLoading, isBlocked: true };
  }

  return { warning, isLoading, isBlocked: false };
}

// --- L1 Data Fee ---

export function getL1DataFeeToAdd(
  hasOpStackFeature: boolean,
  l1DataFee: Dec | undefined
): Dec {
  return hasOpStackFeature ? l1DataFee ?? new Dec(0) : new Dec(0);
}

// --- Fee Computation ---

export function computeEIP1559TxFees(
  ethereumQueries: EthereumQueriesImpl,
  feeType: FeeType,
  chainId: string,
  customMaxPriorityFeePerGas?: Dec
): EIP1559TxFees {
  const block = ethereumQueries.queryEthereumBlock.getQueryByBlockNumberOrTag(
    ETH_FEE_HISTORY_NEWEST_BLOCK
  ).block;
  const latestBaseFeePerGas = parseInt(block?.baseFeePerGas ?? "0");
  if (latestBaseFeePerGas !== 0) {
    const multiplier =
      ETH_FEE_SETTINGS_BY_FEE_TYPE[feeType].baseFeePercentageMultiplier;
    const baseFeePerGasDec = new Dec(latestBaseFeePerGas);
    const baseFeePerGasWithMargin = baseFeePerGasDec.mul(multiplier);
    const maxPriorityFeePerGas =
      customMaxPriorityFeePerGas ??
      calculateOptimalMaxPriorityFeePerGas(ethereumQueries, feeType, chainId);
    const maxFeePerGas = baseFeePerGasWithMargin.add(maxPriorityFeePerGas);

    return {
      maxPriorityFeePerGas: maxPriorityFeePerGas.truncateDec(),
      maxFeePerGas: maxFeePerGas.truncateDec(),
    };
  } else {
    const gasPrice = ethereumQueries.queryEthereumGasPrice.gasPrice;

    if (gasPrice != null) {
      const multipliedGasPrice = new Dec(BigInt(gasPrice)).mul(
        ETH_FEE_SETTINGS_BY_FEE_TYPE[feeType].baseFeePercentageMultiplier
      );

      return {
        gasPrice: multipliedGasPrice,
      };
    }
  }

  return {
    gasPrice: new Dec(0),
  };
}
