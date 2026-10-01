import { useCallback, useEffect, useRef, useState } from "react";
import { GetEpixSwapsMsg, RefreshEpixSwapMsg } from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import {
  createOperationsState,
  mergeOperationsState,
  OperationsState,
} from "./operations-state";

export const swapRequester = new InExtensionMessageRequester();

export function useSwapOperations(vaultId: string | undefined, owner: string) {
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const mounted = useRef(true);
  const requestGeneration = useRef(0);
  const [state, setState] = useState(() => createOperationsState(owner));
  const update = useCallback(
    (values: Partial<Omit<OperationsState, "owner">>) => {
      if (mounted.current && currentOwner.current === owner)
        setState((previous) => mergeOperationsState(previous, owner, values));
    },
    [owner]
  );
  const load = useCallback(
    async (track = false) => {
      if (!vaultId) return;
      const generation = ++requestGeneration.current;
      try {
        let operations = await swapRequester.sendMessage(
          BACKGROUND_PORT,
          new GetEpixSwapsMsg(vaultId)
        );
        if (track) {
          const pending = operations.filter(
            (operation) =>
              operation.status === "paused" &&
              (operation.swapTxHash ||
                (operation.bridgeTxHash && !operation.depositConfirmed))
          );
          await Promise.all(
            pending.map((operation) =>
              swapRequester.sendMessage(
                BACKGROUND_PORT,
                new RefreshEpixSwapMsg(operation.id)
              )
            )
          );
          if (pending.length)
            operations = await swapRequester.sendMessage(
              BACKGROUND_PORT,
              new GetEpixSwapsMsg(vaultId)
            );
        }
        if (generation === requestGeneration.current)
          update({ operations, ready: true, error: false });
      } catch {
        if (generation === requestGeneration.current) update({ error: true });
      }
    },
    [vaultId, update]
  );
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let loading = false;
    const check = async () => {
      if (disposed || loading) return;
      loading = true;
      try {
        await load(true);
      } finally {
        loading = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 3_000);
    return () => {
      disposed = true;
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load]);
  const refresh = async (id?: string) => {
    update({ checking: true });
    try {
      if (id)
        await swapRequester.sendMessage(
          BACKGROUND_PORT,
          new RefreshEpixSwapMsg(id)
        );
      await load();
    } catch {
      update({ error: true });
    } finally {
      update({ checking: false });
    }
  };
  return {
    operations: state.owner === owner ? state.operations : [],
    ready: state.owner === owner && state.ready,
    error: state.owner === owner && state.error,
    checking: state.owner === owner && state.checking,
    load,
    refresh,
  };
}
