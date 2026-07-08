import Transport from "@ledgerhq/hw-transport";
import { CosmosApp, getAppInfo } from "@keplr-wallet/ledger-cosmos";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import {
  getLedgerTransport,
  isNativeBridgeTransport,
} from "./ledger-transport";

export const LedgerUtils = {
  tryAppOpen: async (transport: Transport, app: string): Promise<Transport> => {
    let isAppOpened = false;
    try {
      const appInfo = await getAppInfo(transport);
      if (appInfo.error_message === "No errors" && appInfo.app_name === app) {
        isAppOpened = true;
      }
    } catch (e) {
      // Ignore error
      console.log(e);
    }

    try {
      if (!isAppOpened) {
        await CosmosApp.openApp(transport, app);

        const maxRetry = 25;
        let i = 0;
        while (i < maxRetry) {
          // Reinstantiate the app with the new transport.
          // This is needed because the connection can be closed if app opened. (Maybe ledger's permission system handles dashboard, and each app differently.)
          // The native bridge has no persistent connection to reopen, but a
          // fresh instance is harmless; keep it the same transport kind.
          transport = isNativeBridgeTransport(transport)
            ? await getLedgerTransport(false)
            : transport instanceof TransportWebHID
            ? await TransportWebHID.create()
            : await getLedgerTransport(false);

          const appInfo = await getAppInfo(transport);
          if (
            appInfo.error_message === "No errors" &&
            appInfo.app_name === app
          ) {
            break;
          }

          i++;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    } catch {
      // Ignore error
    }

    return transport;
  },
};
