import { Router } from "@keplr-wallet/router";
import { ROUTE } from "./constants";
import { getHandler } from "./handler";
import { EpixSwapService } from "./service";
import {
  GetEpixSwapsMsg,
  PrepareEpixSwapMsg,
  RefreshEpixSwapMsg,
  StartEpixSwapMsg,
} from "./messages";

export function init(router: Router, service: EpixSwapService): void {
  router.registerMessage(PrepareEpixSwapMsg);
  router.registerMessage(StartEpixSwapMsg);
  router.registerMessage(GetEpixSwapsMsg);
  router.registerMessage(RefreshEpixSwapMsg);
  router.addHandler(ROUTE, getHandler(service));
}
