// iOS page-side provider. No keys or privileged extension APIs enter the page.
// The native host authenticates the frame and supplies its origin to the same
// background router and permission checks used by the browser extension.
import { InjectedKeplr, Keplr } from "@keplr-wallet/provider";
import {
  EthereumProviderRpcError,
  JSONUint8Array,
  KeplrError,
  Message,
  MessageRequester,
} from "@keplr-wallet/router";
import manifest from "./manifest.v2.json";
import "./content-scripts/inject/injected-script";

class MobileRequester implements MessageRequester {
  async sendMessage<M extends Message<unknown>>(
    port: string,
    msg: M
  ): Promise<M extends Message<infer R> ? R : never> {
    msg.validateBasic();
    const bridge = (window as any).webkit?.messageHandlers?.epixDapp;
    if (!bridge) throw new Error("Epix mobile wallet is unavailable");
    const result = JSONUint8Array.unwrap(
      await bridge.postMessage({
        port,
        type: msg.type(),
        msg: JSONUint8Array.wrap(msg),
      })
    );
    if (!result) throw new Error("Empty mobile wallet response");
    if (result.error) {
      const error = result.error;
      if (typeof error === "string") throw new Error(error);
      if (typeof error.module === "string") {
        throw new KeplrError(error.module, error.code, error.message);
      }
      throw new EthereumProviderRpcError(error.code, error.message, error.data);
    }
    return result.return;
  }
}

InjectedKeplr.startProxy(
  new Keplr(manifest.version, "core", new MobileRequester()),
  process.env.KEPLR_EXT_PROVIDER_META_ID || undefined
);
