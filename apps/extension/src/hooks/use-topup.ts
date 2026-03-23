import {
  FeeConfig,
  IFeeConfig,
  ISenderConfig,
  InsufficientFeeError,
} from "@keplr-wallet/hooks";
import { useStore } from "../stores";
import { useEffect, useState } from "react";
import { TopUpClient } from "@keplr-wallet/topup-client";
import { TendermintTxTracer } from "@keplr-wallet/cosmos";
import { useIntl } from "react-intl";

export interface TopUpParams {
  feeConfig: IFeeConfig;
  senderConfig: ISenderConfig;
  hasHardwareWalletError?: boolean;
}

export interface TopUpResult {
  shouldTopUp: boolean;
  remainingText: string | undefined;
  isTopUpAvailable: boolean;
  isTopUpInProgress: boolean;
  topUpCompleted: boolean;
  executeTopUpIfAvailable: () => Promise<void>;
  topUpError: Error | undefined;
  stakingChainId?: string;
  validatorAddress?: string;
  coinDenom?: string;
  coinMinimalDenom?: string;
  requiredStaking?: number;
  additionalStakingNeeded?: number;
}

export function useTopUp({
  feeConfig,
  senderConfig,
  hasHardwareWalletError,
}: TopUpParams): TopUpResult {
  const { chainStore, queriesStore } = useStore();
  const intl = useIntl();
  const [isTopUpInProgress, setIsTopUpInProgress] = useState(false);
  const [topUpCompleted, setTopUpCompleted] = useState(false);
  const [topUpError, setTopUpError] = useState<Error | undefined>(undefined);

  const topupBaseURL = process.env["KEPLR_EXT_TOPUP_BASE_URL"] || "";
  const topupApiKey = process.env["KEPLR_EXT_TOPUP_API_KEY"] || "";
  const isTopupConfigured = !!(topupBaseURL.trim() && topupApiKey.trim());

  // topUpStatus는 cosmos FeeConfig에만 존재. EVM FeeConfig에는 없으므로 런타임 가드 필요.
  const cosmosFeeConfig =
    "topUpStatus" in feeConfig ? (feeConfig as FeeConfig) : undefined;

  const shouldTopUp =
    isTopupConfigured && // 환경 변수가 설정되어 있어야 함
    !topUpCompleted &&
    !hasHardwareWalletError &&
    !!cosmosFeeConfig?.topUpStatus.shouldTopUp;

  const isTopUpAvailable =
    isTopupConfigured && !!cosmosFeeConfig?.topUpStatus.isTopUpAvailable;

  const [remainingTimeMs, setRemainingTimeMs] = useState<number>();

  const remainingText = (() => {
    if (remainingTimeMs === undefined) return undefined;

    const HOUR_MS = 60 * 60 * 1000;
    const MINUTE_MS = 60 * 1000;
    let time: string;

    if (remainingTimeMs >= HOUR_MS) {
      const hours = Math.floor(remainingTimeMs / HOUR_MS);
      const minutes = Math.floor((remainingTimeMs % HOUR_MS) / MINUTE_MS);
      time = `${hours.toString().padStart(2, "0")}h ${minutes
        .toString()
        .padStart(2, "0")}m`;
    } else {
      const minutes = Math.floor(remainingTimeMs / MINUTE_MS);
      const seconds = Math.floor((remainingTimeMs % MINUTE_MS) / 1000);
      time = `${minutes.toString().padStart(2, "0")}m ${seconds
        .toString()
        .padStart(2, "0")}s`;
    }

    return intl.formatMessage({ id: "components.top-up.wait-time" }, { time });
  })();

  useEffect(() => {
    if (!cosmosFeeConfig) return;
    const serverRemaining = cosmosFeeConfig.topUpStatus.remainingTimeMs;

    setRemainingTimeMs((prev) => {
      if (serverRemaining === undefined) {
        return undefined;
      }
      if (prev === undefined) {
        return serverRemaining;
      }
      return Math.min(prev, serverRemaining);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cosmosFeeConfig?.topUpStatus.remainingTimeMs]);

  useEffect(() => {
    if (remainingTimeMs === undefined || remainingTimeMs <= 0) return;

    const interval = setInterval(() => {
      setRemainingTimeMs((prev) => {
        if (prev === undefined) {
          clearInterval(interval);
          cosmosFeeConfig?.refreshTopUpStatus();
          return undefined;
        }
        if (prev <= 0) {
          clearInterval(interval);
          cosmosFeeConfig?.refreshTopUpStatus();
          return 0;
        }
        return Math.max(prev - 1000, 0);
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingTimeMs !== undefined && remainingTimeMs > 0]);

  async function executeTopUpIfAvailable() {
    if (!shouldTopUp || isTopUpInProgress || !cosmosFeeConfig) {
      return;
    }

    setIsTopUpInProgress(true);
    setTopUpError(undefined);

    try {
      const stdFee =
        cosmosFeeConfig.topUpStatus.topUpOverrideStdFee ??
        cosmosFeeConfig.toStdFee();
      const client = new TopUpClient(
        process.env["KEPLR_EXT_TOPUP_BASE_URL"] || "",
        process.env["KEPLR_EXT_TOPUP_API_KEY"] || ""
      );

      const topUpTxHash = await client.postTopUp({
        chainId: feeConfig.chainId,
        recipientAddress: senderConfig.sender,
        fee: stdFee,
      });

      const modularChainInfo = chainStore.getModularChain(feeConfig.chainId);
      const uTopUp = modularChainInfo.unwrapped;
      if (uTopUp.type !== "cosmos" && uTopUp.type !== "ethermint") {
        throw new Error("Top up is only supported for cosmos chains");
      }
      const rpc = uTopUp.cosmos.rpc;
      const tracer = new TendermintTxTracer(rpc, "/websocket");

      try {
        await tracer.traceTx(Buffer.from(topUpTxHash, "hex") as Uint8Array);
      } finally {
        tracer.close();
      }

      setTopUpCompleted(true);

      queriesStore
        .get(feeConfig.chainId)
        .queryBalances.getQueryBech32Address(senderConfig.sender)
        .fetch();
    } catch (e) {
      console.error(e);

      const error = new Error(
        intl.formatMessage({
          id: "page.sign.cosmos.tx.top-up-error-message",
        })
      );

      setTopUpError(error);

      throw error;
    } finally {
      setIsTopUpInProgress(false);

      // 마지막으로 query의 상태를 최신화한다.
      // (서명 이후 extension을 끄지 않고 바로 다시 tx를 시도할때 ui flickering 방지)
      cosmosFeeConfig?.refreshTopUpStatus();
    }
  }

  return {
    shouldTopUp,
    remainingText,
    isTopUpAvailable,
    isTopUpInProgress,
    topUpCompleted,
    executeTopUpIfAvailable,
    topUpError,
    ...(cosmosFeeConfig &&
    feeConfig.uiProperties.error instanceof InsufficientFeeError
      ? {
          stakingChainId: cosmosFeeConfig.topUpStatus.stakingChainId,
          validatorAddress: cosmosFeeConfig.topUpStatus.validatorAddress,
          coinDenom: cosmosFeeConfig.topUpStatus.coinDenom,
          coinMinimalDenom: cosmosFeeConfig.topUpStatus.coinMinimalDenom,
          requiredStaking: cosmosFeeConfig.topUpStatus.requiredStaking,
          additionalStakingNeeded:
            cosmosFeeConfig.topUpStatus.additionalStakingNeeded,
        }
      : {}),
  };
}
