import { Router } from "@keplr-wallet/router";
import {
  GetSidePanelOverlayDisabledMsg,
  GetThemeOptionMsg,
  SetSidePanelOverlayDisabledMsg,
  SetThemeOptionMsg,
} from "./messages";
import { ROUTE } from "./constants";
import { getHandler } from "./handler";
import { SettingsService } from "./service";

export function init(router: Router, service: SettingsService): void {
  router.registerMessage(GetThemeOptionMsg);
  router.registerMessage(SetThemeOptionMsg);
  router.registerMessage(GetSidePanelOverlayDisabledMsg);
  router.registerMessage(SetSidePanelOverlayDisabledMsg);

  router.addHandler(ROUTE, getHandler(service));
}
