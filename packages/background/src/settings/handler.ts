import {
  Env,
  Handler,
  InternalHandler,
  KeplrError,
  Message,
} from "@keplr-wallet/router";
import { SettingsService } from "./service";
import {
  GetSidePanelOverlayDisabledMsg,
  GetThemeOptionMsg,
  SetSidePanelOverlayDisabledMsg,
  SetThemeOptionMsg,
} from "./messages";

export const getHandler: (service: SettingsService) => Handler = (service) => {
  return (env: Env, msg: Message<unknown>) => {
    switch (msg.constructor) {
      case GetThemeOptionMsg:
        return handleGetThemeOptionMsg(service)(env, msg as GetThemeOptionMsg);
      case SetThemeOptionMsg:
        return handleSetThemeOptionMsg(service)(env, msg as SetThemeOptionMsg);
      case GetSidePanelOverlayDisabledMsg:
        return handleGetSidePanelOverlayDisabledMsg(service)(
          env,
          msg as GetSidePanelOverlayDisabledMsg
        );
      case SetSidePanelOverlayDisabledMsg:
        return handleSetSidePanelOverlayDisabledMsg(service)(
          env,
          msg as SetSidePanelOverlayDisabledMsg
        );
      default:
        throw new KeplrError("settings", 110, "Unknown msg type");
    }
  };
};

const handleGetThemeOptionMsg: (
  service: SettingsService
) => InternalHandler<GetThemeOptionMsg> = (service) => {
  return () => {
    return service.getThemeOption();
  };
};

const handleSetThemeOptionMsg: (
  service: SettingsService
) => InternalHandler<SetThemeOptionMsg> = (service) => {
  return (_, msg) => {
    return service.setThemeOption(msg.themeOption);
  };
};

const handleGetSidePanelOverlayDisabledMsg: (
  service: SettingsService
) => InternalHandler<GetSidePanelOverlayDisabledMsg> = (service) => {
  return () => {
    return service.getSidePanelOverlayDisabled();
  };
};

const handleSetSidePanelOverlayDisabledMsg: (
  service: SettingsService
) => InternalHandler<SetSidePanelOverlayDisabledMsg> = (service) => {
  return (_, msg) => {
    return service.setSidePanelOverlayDisabled(msg.disabled);
  };
};
