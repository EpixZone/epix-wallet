import { Handler, KeplrError } from "@keplr-wallet/router";
import { EpixSwapService } from "./service";
import {
  GetEpixSwapsMsg,
  PrepareEpixSwapMsg,
  RefreshEpixSwapMsg,
  StartEpixSwapMsg,
} from "./messages";

export function getHandler(service: EpixSwapService): Handler {
  return (env, msg) => {
    if (msg instanceof PrepareEpixSwapMsg) return service.prepare(env, msg);
    if (msg instanceof StartEpixSwapMsg)
      return service.start(env, msg.reviewId);
    if (msg instanceof GetEpixSwapsMsg)
      return service.getOperations(env, msg.vaultId);
    if (msg instanceof RefreshEpixSwapMsg) return service.refresh(env, msg.id);
    throw new KeplrError("epix-swap", 100, "Unknown swap message");
  };
}
