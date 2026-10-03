import { EpixSwapOperation } from "@keplr-wallet/background";

export function createOperationsState(owner: string) {
  return {
    owner,
    operations: [] as EpixSwapOperation[],
    ready: false,
    error: false,
    checking: false,
  };
}

export type OperationsState = ReturnType<typeof createOperationsState>;

export function mergeOperationsState(
  previous: OperationsState,
  owner: string,
  update: Partial<Omit<OperationsState, "owner">>
): OperationsState {
  // A failed first load must never relabel the previous wallet's recovery data.
  const current =
    previous.owner === owner ? previous : createOperationsState(owner);
  return { ...current, ...update };
}
