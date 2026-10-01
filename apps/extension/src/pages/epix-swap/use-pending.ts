import { useEffect, useRef, useState } from "react";
import { EpixBridgeEndpoints } from "./bridge";
import {
  isPendingTransaction,
  PendingSwapTransaction,
  refreshPendingTransaction,
} from "./execution";
import { createExtensionPendingTransactionStore } from "./pending";

const pendingStore = createExtensionPendingTransactionStore();

export function usePendingTransactions(
  owner: string,
  endpoints: EpixBridgeEndpoints
) {
  const { epix, osmosis } = endpoints;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const mounted = useRef(true);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const [state, setState] = useState({
    owner,
    transactions: [] as PendingSwapTransaction[],
    ready: false,
    checking: false,
    error: false,
  });
  const record = async (
    transaction: PendingSwapTransaction,
    requirePersistence = false
  ) => {
    if (requirePersistence) {
      const saved = await pendingStore.read(owner);
      if (
        saved.some(
          (item) =>
            item.hash !== transaction.hash &&
            isPendingTransaction(item) &&
            item.chainId === transaction.chainId &&
            item.direction === transaction.direction
        )
      )
        throw new Error(
          "Another transaction is pending. Check its status before sending again."
        );
    }
    const transactions = await pendingStore.merge(
      owner,
      [transaction],
      requirePersistence
    );
    if (mounted.current && currentOwner.current === owner)
      setState((prior) => ({ ...prior, owner, transactions }));
  };
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let checking = false;
    const update = (values: Partial<typeof state>) => {
      if (!controller.signal.aborted && currentOwner.current === owner)
        setState((prior) => ({ ...prior, ...values, owner }));
    };
    const check = async () => {
      if (checking || controller.signal.aborted) return;
      checking = true;
      update({ checking: true, error: false });
      try {
        const prior = await pendingStore.read(owner);
        update({ transactions: prior, ready: true });
        let failed = false;
        const next = await Promise.all(
          prior.map(async (transaction) => {
            try {
              return await refreshPendingTransaction(
                transaction,
                { epix, osmosis },
                controller.signal
              );
            } catch {
              failed = true;
              return transaction;
            }
          })
        );
        if (!controller.signal.aborted)
          update({
            transactions: await pendingStore.merge(owner, next),
            error: failed,
          });
      } catch {
        update({ error: true });
      } finally {
        checking = false;
        update({ checking: false });
      }
    };
    refreshRef.current = check;
    void check();
    const timer = setInterval(() => {
      void check();
    }, 6_000);
    return () => {
      mounted.current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [owner, epix, osmosis]);
  return {
    transactions: state.owner === owner ? state.transactions : [],
    ready: state.owner === owner && state.ready,
    checking: state.owner === owner && state.checking,
    error: state.owner === owner && state.error,
    refresh: () => refreshRef.current(),
    record,
  };
}
