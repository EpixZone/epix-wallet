import Transport from "@ledgerhq/hw-transport";

// A Ledger transport that bridges APDUs to the Epix host over the extension's
// native-messaging host, for shells with no WebHID/WebUSB (desktop Firefox and
// the mobile WebViews). Native messaging is background-only, so the APDU goes
// through the background's epix-native handler (see epix-native.ts), which
// forwards it to the host; the host implements the Ledger HID framing.
//
// The host is spawned per message, so there is no persistent device handle -
// each exchange is a self-contained open/APDU/close. That is fine: a Ledger
// APDU is a complete request/response, and the app's signing state lives on
// the device, not on the HID connection.

function sendToBackground(msg: object): Promise<any> {
  const runtime: any = (globalThis as any).browser?.runtime;
  if (!runtime?.sendMessage) {
    return Promise.reject(new Error("extension messaging unavailable"));
  }
  return runtime.sendMessage(msg);
}

function toHex(buf: Buffer): string {
  return buf.toString("hex");
}

export class TransportNativeBridge extends Transport {
  /**
   * Available when the extension can reach a background (all Epix shells).
   * The actual presence of a device is checked by `create` via ledgerList.
   * Sync variant for getLedgerTransport; the static below satisfies the
   * Transport base class, which wants a Promise.
   */
  static isAvailable(): boolean {
    return !!(globalThis as any).browser?.runtime?.sendMessage;
  }

  static override isSupported(): Promise<boolean> {
    return Promise.resolve(TransportNativeBridge.isAvailable());
  }

  /** The Ledger devices the host can see. */
  static override async list(): Promise<
    Array<{ path: string; product: string }>
  > {
    const res = await sendToBackground({ type: "epix-ledger-list" });
    if (!res?.ok) {
      throw new Error(res?.error || "could not list Ledger devices");
    }
    return res.devices || [];
  }

  /**
   * Open a transport to the first connected Ledger. Throws if none is found,
   * so the caller shows the same "connect your Ledger" guidance as WebHID.
   */
  static override async create(): Promise<TransportNativeBridge> {
    const devices = await TransportNativeBridge.list();
    if (devices.length === 0) {
      throw new Error(
        "No Ledger device found. Connect and unlock your Ledger."
      );
    }
    return new TransportNativeBridge(devices[0].path);
  }

  private constructor(private readonly path?: string) {
    super();
  }

  override async exchange(apdu: Buffer): Promise<Buffer> {
    const res = await sendToBackground({
      type: "epix-ledger-exchange",
      apdu: toHex(apdu),
      path: this.path,
    });
    if (!res?.ok || typeof res.response !== "string") {
      throw new Error(res?.error || "Ledger exchange failed");
    }
    return Buffer.from(res.response, "hex");
  }

  override async close(): Promise<void> {
    // Nothing to close: the host opens and closes the device per exchange.
  }
}
