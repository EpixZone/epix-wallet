import type { EndpointHealthSnapshot } from "@keplr-wallet/background";
import type { ModularChainInfo } from "@keplr-wallet/types";
import type { UseFormReturn } from "react-hook-form";

export interface EndpointFormData {
  rpc: string;
  lcd?: string;
  evmRpc?: string;
}
export const ENDPOINT_FORM_KEYS = ["rpc", "lcd", "evmRpc"] as const;

export function preferredEndpointFormValues(
  type: ModularChainInfo["type"],
  current: EndpointFormData,
  preferred?: EndpointHealthSnapshot["preferred"]
): EndpointFormData {
  if (!preferred) return current;
  if (type === "cosmos") return { rpc: preferred.rpc, lcd: preferred.rest };
  if (type === "ethermint")
    return {
      rpc: preferred.rpc,
      lcd: preferred.rest,
      evmRpc: preferred.evmRpc,
    };
  if (type === "evm") return { rpc: preferred.evmRpc ?? current.rpc };
  return current;
}

export function endpointFormUpdates(
  values: EndpointFormData,
  dirty: Partial<Record<keyof EndpointFormData, boolean>>
): Partial<EndpointFormData> {
  const updates: Partial<EndpointFormData> = {};
  for (const key of ENDPOINT_FORM_KEYS)
    if (!dirty[key]) updates[key] = values[key];
  return updates;
}

export function syncCleanEndpointFields(
  values: EndpointFormData,
  form: Pick<UseFormReturn<EndpointFormData>, "getFieldState" | "resetField">
): void {
  const updates = endpointFormUpdates(values, {
    rpc: form.getFieldState("rpc").isDirty,
    lcd: form.getFieldState("lcd").isDirty,
    evmRpc: form.getFieldState("evmRpc").isDirty,
  });
  for (const key of ENDPOINT_FORM_KEYS) {
    if (key in updates) form.resetField(key, { defaultValue: updates[key] });
  }
}
