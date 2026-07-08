import Transport from "@ledgerhq/hw-transport";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import { TransportNativeBridge } from "./ledger-native-transport";

// The single place the wallet opens a Ledger transport. Keplr's stock flow
// uses WebHID/WebUSB, which are Chromium-only; the Epix shells (desktop
// Firefox, Android GeckoView, iOS WKWebView) do not have them, so there we
// bridge APDUs to the Epix host over the native-messaging host instead. All
// the register/sign call sites go through here so the choice is made once.

/** Whether the browser exposes the Chromium-only WebHID/WebUSB device APIs. */
export function isWebLedgerSupported(): boolean {
  const nav: any = typeof navigator !== "undefined" ? navigator : undefined;
  return (
    !!nav && (typeof nav.hid !== "undefined" || typeof nav.usb !== "undefined")
  );
}

/**
 * Open a Ledger transport. `useWebHID` picks WebHID vs WebUSB on Chromium
 * (some apps, e.g. Starknet, require WebHID); it is ignored on the native
 * bridge, which has a single HID path.
 */
export async function getLedgerTransport(
  useWebHID: boolean
): Promise<Transport> {
  // Prefer the browser's own device API when present (a Chromium build).
  if (isWebLedgerSupported()) {
    return useWebHID ? TransportWebHID.create() : TransportWebUSB.create();
  }
  // Epix shells: bridge to the host.
  if (TransportNativeBridge.isAvailable()) {
    return TransportNativeBridge.create();
  }
  // Nothing available: surface the web transport's own error.
  return useWebHID ? TransportWebHID.create() : TransportWebUSB.create();
}

/** True when a Ledger transport `t` is the native bridge (not a web transport). */
export function isNativeBridgeTransport(t: Transport): boolean {
  return t instanceof TransportNativeBridge;
}
