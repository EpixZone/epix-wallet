export type SendType = "bridge" | "ibc-transfer" | "send";

export interface TopUpState {
  shouldTopUp: boolean;
  remainingText: string | undefined;
  isTopUpAvailable: boolean;
}

export const DEFAULT_TOPUP_STATE: TopUpState = {
  shouldTopUp: false,
  remainingText: undefined,
  isTopUpAvailable: false,
};
