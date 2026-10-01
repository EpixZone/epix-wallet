import { KVStore } from "@keplr-wallet/common";

export type SwapDraft = {
  stage: "deposit" | "swap" | "withdraw";
  inputIndex: number;
  outputIndex: number;
  amount: string;
  slippage: number;
  feeIndex: number;
};

const draftKeys = [
  "stage",
  "inputIndex",
  "outputIndex",
  "amount",
  "slippage",
  "feeIndex",
];

function validTokenIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
  );
}

export function validateSwapDraft(value: unknown): value is SwapDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  if (
    Object.keys(value).length !== draftKeys.length ||
    !Object.keys(value).every((key) => draftKeys.includes(key))
  )
    return false;
  const draft = value as Partial<SwapDraft>;
  return (
    ["deposit", "swap", "withdraw"].includes(draft.stage ?? "") &&
    validTokenIndex(draft.inputIndex) &&
    validTokenIndex(draft.outputIndex) &&
    typeof draft.amount === "string" &&
    draft.amount.length <= 100 &&
    draft.amount.trim() === draft.amount &&
    /^\d*(?:\.\d*)?$/.test(draft.amount) &&
    [50, 100, 300].includes(draft.slippage ?? 0) &&
    [1, 2, 3].includes(draft.feeIndex ?? 0)
  );
}

/** Only editable form choices are stored; reviews and signed transactions expire. */
export class SwapDraftStore {
  private readonly values = new Map<string, SwapDraft | undefined>();
  private readonly loads = new Map<string, Promise<SwapDraft | undefined>>();
  private readonly writes = new Map<string, Promise<void>>();

  constructor(private readonly storage: Pick<KVStore, "get" | "set">) {}

  async read(owner: string): Promise<SwapDraft | undefined> {
    if (!this.values.has(owner)) {
      let pending = this.loads.get(owner);
      if (!pending) {
        pending = this.storage.get<unknown>(owner).then((value) => {
          // A save during hydration is newer than the stored snapshot.
          if (!this.values.has(owner)) {
            this.values.set(
              owner,
              validateSwapDraft(value) ? { ...value } : undefined
            );
          }
          return this.values.get(owner);
        });
        this.loads.set(owner, pending);
      }
      try {
        await pending;
      } finally {
        this.loads.delete(owner);
      }
    }
    const value = this.values.get(owner);
    return value && { ...value };
  }

  save(owner: string, draft: SwapDraft): Promise<void> {
    if (!validateSwapDraft(draft))
      return Promise.reject(new TypeError("Invalid swap draft"));
    const snapshot = { ...draft };
    this.values.set(owner, snapshot);
    const previous = this.writes.get(owner) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(() => this.storage.set(owner, { ...snapshot }));
    this.writes.set(owner, write);
    return write;
  }
}
