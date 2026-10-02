import { EpixSwapOperation } from "@keplr-wallet/background";
import {
  createOperationsState,
  mergeOperationsState,
} from "./operations-state";

const operation: EpixSwapOperation = {
  direction: "to-osmosis",
  inputDenom: "aepix",
  sourceChainId: "epix_1916-1",
  destinationChainId: "osmosis-1",
  id: "swap-a",
  vaultId: "wallet-a",
  sourceAddress: "epix-source-a",
  destinationAddress: "osmosis-destination-a",
  amountIn: "1000000000000000000",
  outputDenom: "uosmo",
  minimumAmountOut: "1900",
  estimatedAmountOut: "2000",
  slippageBps: 100,
  feeDenom: "uosmo",
  bridgeFee: { amount: [{ denom: "aepix", amount: "1" }], gas: "100000" },
  swapFeeCap: { amount: [{ denom: "uosmo", amount: "1" }], gas: "100000" },
  sourceRest: "https://source.example",
  destinationRest: "https://destination.example",
  status: "paused",
  createdAt: 1,
  updatedAt: 1,
  expiresAt: 2,
  depositConfirmed: false,
};

const loadedWalletA = () =>
  mergeOperationsState(createOperationsState("wallet-a"), "wallet-a", {
    operations: [operation],
    ready: true,
    checking: true,
  });

test("wallet B's rejected first load cannot display wallet A's recovery plan", () => {
  const state = mergeOperationsState(loadedWalletA(), "wallet-b", {
    error: true,
  });
  expect(state).toEqual({
    owner: "wallet-b",
    operations: [],
    ready: false,
    checking: false,
    error: true,
  });
});

test("manual checking before a new wallet loads also clears old recovery data", () => {
  const state = mergeOperationsState(loadedWalletA(), "wallet-b", {
    checking: true,
  });
  expect(state.operations).toEqual([]);
  expect(state.ready).toBe(false);
  expect(state.checking).toBe(true);
  expect(state.error).toBe(false);
});

test("a same-wallet polling failure preserves the last known pending operation", () => {
  const state = mergeOperationsState(loadedWalletA(), "wallet-a", {
    error: true,
    checking: false,
  });
  expect(state.operations).toEqual([operation]);
  expect(state.ready).toBe(true);
  expect(state.error).toBe(true);
  expect(state.checking).toBe(false);
});
