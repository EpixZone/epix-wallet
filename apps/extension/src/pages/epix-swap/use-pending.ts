import { useEffect, useRef, useState } from "react";
import { ExtensionKVStore } from "@keplr-wallet/common";
import { EpixBridgeEndpoints } from "./bridge";
import { PendingSwapTransaction, refreshPendingTransaction } from "./execution";
import { PendingTransactionStore } from "./pending";

const pendingStore = new PendingTransactionStore(
  new ExtensionKVStore("epix-swap-pending")
);

export function usePendingTransactions(
  owner: string,
  endpoints: EpixBridgeEndpoints
) {
  const { epix, osmosis } = endpoints;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const mounted = useRef(true);
  const [state, setState] = useState({
    owner,
    transactions: [] as PendingSwapTransaction[],
  });
  const record = (transaction: PendingSwapTransaction) => {
    void pendingStore.merge(owner, [transaction]).then((transactions) => {
      if (mounted.current && currentOwner.current === owner)
        setState({ owner, transactions });
    });
  };
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let checking = false;
    const show = (transactions: PendingSwapTransaction[]) => {
      if (!controller.signal.aborted && currentOwner.current === owner)
        setState({ owner, transactions });
    };
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const prior = await pendingStore.read(owner);
        show(prior);
        const next = await Promise.all(
          prior.map(async (transaction) => {
            try {
              return await refreshPendingTransaction(
                transaction,
                { epix, osmosis },
                controller.signal
              );
            } catch {
              return transaction;
            }
          })
        );
        if (!controller.signal.aborted)
          show(await pendingStore.merge(owner, next));
      } finally {
        checking = false;
      }
    };
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
    record,
  };
}
