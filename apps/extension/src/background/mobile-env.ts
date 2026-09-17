import { APP_PORT, Env, EnvProducer } from "@keplr-wallet/router";
import {
  ExtensionEnv,
  InExtensionMessageRequester,
  InteractionAddon,
} from "@keplr-wallet/router-extension";
import { getKeplrExtensionRouterId } from "@keplr-wallet/router-extension/build/utils";

// Mobile background + approval UI share one persistent wallet document.
// Keep external callers external: only the interaction's UI transport changes.
// The normal router's origin guard and approveExternal checks still execute.
export const mobileEnv: EnvProducer = (sender, routerMeta) => {
  const env = ExtensionEnv.produceEnv(sender, routerMeta);
  const host = (globalThis as any).window?.webkit?.messageHandlers?.epixDappUI;
  if (!host || env.isInternalMsg) return env;

  const requestInteraction: Env["requestInteraction"] = async (
    path,
    message,
    options
  ) => {
    const receiverRouterId = getKeplrExtensionRouterId();
    let url = browser.runtime.getURL(
      "/mobile.html#/" + path.replace(/^\//, "")
    );
    url +=
      (url.includes("?") ? "&" : "?") +
      "interaction=true&interactionInternal=false";
    const requester = new InExtensionMessageRequester();
    const replace = new InteractionAddon.ReplacePageMsg(url);
    replace.routerMeta = { ...replace.routerMeta, receiverRouterId };
    message.routerMeta = { ...message.routerMeta, receiverRouterId };

    let cancelled = false;
    let onClose: () => void = () => undefined;
    const closed = new Promise<never>((_, reject) => {
      onClose = () => {
        cancelled = true;
        try {
          options?.unstableOnClose?.();
        } finally {
          reject(new Error("Request rejected: wallet closed"));
        }
      };
      window.addEventListener("epix-wallet-closed", onClose, { once: true });
    });
    try {
      host.postMessage("");
      return await Promise.race([
        closed,
        (async () => {
          await requester.sendMessage(APP_PORT, replace);
          if (cancelled) throw new Error("Request rejected: wallet closed");
          return requester.sendMessage(APP_PORT, message);
        })(),
      ]);
    } finally {
      window.removeEventListener("epix-wallet-closed", onClose);
    }
  };
  return { ...env, requestInteraction };
};
