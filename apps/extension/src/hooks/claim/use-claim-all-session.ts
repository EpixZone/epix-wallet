import { useCallback, useEffect } from "react";
import { ClaimAllEachState } from "../../stores/claim-rewards-state";
import { useStore } from "../../stores";
import { ViewClaimToken } from "../use-rewards";

export function useClaimAllSession({
  viewClaimTokens,
  getClaimAllEachState,
}: {
  viewClaimTokens: ViewClaimToken[];
  getClaimAllEachState: (chainId: string) => ClaimAllEachState;
}): {
  hasClaimAllSession: boolean;
  isClaimAllInProgress: boolean;
  claimAllIsLoading: boolean;
  claimAllIsCompleted: boolean;
  claimCountText: string;
  count: number;
  showCompletionUI: boolean;
  startClaimAllSession: () => void;
} {
  const { claimRewardsStateStore } = useStore();
  const claimAllSession = claimRewardsStateStore.getSession();
  const claimSnapshotChainIds = claimAllSession.chainIds;

  const succeededCount = claimSnapshotChainIds.reduce((count, chainId) => {
    if (getClaimAllEachState(chainId).isSucceeded) {
      return count + 1;
    }

    return count;
  }, 0);

  const finishedCount = claimSnapshotChainIds.reduce((count, chainId) => {
    if (getClaimAllEachState(chainId).isCompleted) {
      return count + 1;
    }

    return count;
  }, 0);

  const claimAllIsLoading = claimSnapshotChainIds.some((chainId) => {
    const state = getClaimAllEachState(chainId);

    return state.hasStarted && (state.isLoading || state.isSimulating);
  });

  const claimAllIsCompleted =
    claimSnapshotChainIds.length > 0 &&
    finishedCount === claimSnapshotChainIds.length;
  const hasClaimAllSession = claimAllSession.phase !== "idle";
  const isClaimAllInProgress = claimAllSession.phase === "loading";
  const claimCountText =
    claimSnapshotChainIds.length > 0
      ? `${succeededCount}/${claimSnapshotChainIds.length}`
      : "";

  useEffect(() => {
    if (
      claimAllSession.phase === "loading" &&
      claimAllIsCompleted &&
      !claimAllIsLoading
    ) {
      claimAllSession.startCompletionCountdown();
    }
  }, [claimAllIsCompleted, claimAllIsLoading, claimAllSession]);

  const startClaimAllSession = useCallback(() => {
    claimAllSession.start(
      viewClaimTokens.map(
        (viewClaimToken) => viewClaimToken.modularChainInfo.chainId
      )
    );
  }, [claimAllSession, viewClaimTokens]);

  return {
    hasClaimAllSession,
    isClaimAllInProgress,
    claimAllIsLoading,
    claimAllIsCompleted,
    claimCountText,
    count: claimAllSession.completionCount,
    showCompletionUI: claimAllSession.showCompletionUI,
    startClaimAllSession,
  };
}
