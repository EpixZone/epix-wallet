import { useEffect, useRef, useState } from "react";
import { ExtensionKVStore } from "@keplr-wallet/common";
import { SwapDraft, SwapDraftStore } from "./draft";

const draftStore = new SwapDraftStore(new ExtensionKVStore("epix-swap-draft"));

export function useSwapDraft(
  owner: string | undefined,
  initial: SwapDraft,
  restore: boolean
) {
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({
    owner,
    draft: initial,
    ready: false,
    restored: false,
    error: false,
  });
  useEffect(() => {
    let cancelled = false;
    if (!owner) return;
    void draftStore
      .read(owner)
      .then((saved) => {
        if (!cancelled)
          setState({
            owner,
            draft: restore && saved ? saved : initialRef.current,
            ready: true,
            restored: !!(restore && saved),
            error: false,
          });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            owner,
            draft: initialRef.current,
            ready: false,
            restored: false,
            error: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, restore, retry]);
  const ready = state.owner === owner && state.ready;
  const draft = ready ? state.draft : initial;
  const save = async () => {
    if (!owner || !ready) throw new Error("Draft is still loading");
    try {
      await draftStore.save(owner, draft);
      setState((previous) =>
        previous.owner === owner ? { ...previous, error: false } : previous
      );
    } catch (error) {
      setState((previous) =>
        previous.owner === owner ? { ...previous, error: true } : previous
      );
      throw error;
    }
  };
  useEffect(() => {
    if (!ready || !owner) return;
    let cancelled = false;
    void draftStore
      .save(owner, state.draft)
      .then(() => {
        if (!cancelled) setState((previous) => ({ ...previous, error: false }));
      })
      .catch(() => {
        if (!cancelled) setState((previous) => ({ ...previous, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [owner, ready, state.draft]);
  return {
    draft,
    ready,
    restored: ready && state.restored,
    error: state.owner === owner && state.error,
    retry: () => {
      if (ready) {
        void save().catch(() => undefined);
      } else setRetry((value) => value + 1);
    },
    save,
    update: (update: Partial<SwapDraft>) =>
      setState((previous) =>
        previous.owner === owner && previous.ready
          ? { ...previous, draft: { ...previous.draft, ...update } }
          : previous
      ),
  };
}
