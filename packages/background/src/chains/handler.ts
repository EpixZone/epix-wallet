import {
  Env,
  Handler,
  InternalHandler,
  KeplrError,
  Message,
} from "@keplr-wallet/router";
import { ChainsService } from "./service";
import {
  GetChainInfosWithCoreTypesMsg,
  GetChainInfosWithoutEndpointsMsg,
  RemoveSuggestedChainInfoMsg,
  SuggestChainInfoMsg,
  NeedSuggestChainInfoInteractionMsg,
  SetChainEndpointsMsg,
  ClearChainEndpointsMsg,
  GetChainOriginalEndpointsMsg,
  ClearAllSuggestedChainInfosMsg,
  ClearAllChainEndpointsMsg,
  GetChainInfoWithoutEndpointsMsg,
  PingMsg,
  CheckEndpointHealthMsg,
  SetEndpointPublicFallbackMsg,
} from "./messages";
import { ChainInfo } from "@keplr-wallet/types";
import { getBasicAccessPermissionType, PermissionService } from "../permission";
import { PermissionInteractiveService } from "../permission-interactive";

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export const getHandler: (
  chainsService: ChainsService,
  permissionService: PermissionService,
  permissionInteractiveService: PermissionInteractiveService
) => Handler = (
  chainsService,
  permissionService,
  permissionInteractiveService
) => {
  return (env: Env, msg: Message<unknown>) => {
    switch (msg.constructor) {
      case PingMsg:
        return {};
      case CheckEndpointHealthMsg: {
        const request = msg as CheckEndpointHealthMsg;
        return (
          request.chainId
            ? chainsService.checkEndpointHealth(
                request.chainId,
                request.recover ? "manual" : "connect"
              )
            : chainsService.checkDueEndpointHealth()
        ).then(() => undefined);
      }
      case SetEndpointPublicFallbackMsg: {
        const request = msg as SetEndpointPublicFallbackMsg;
        return chainsService
          .setEndpointPublicFallback(request.chainId, request.enabled)
          .then(() => undefined);
      }
      case GetChainInfosWithCoreTypesMsg:
        return handleGetInfosWithCoreTypesMsg(chainsService)(
          env,
          msg as GetChainInfosWithCoreTypesMsg
        );
      case GetChainInfosWithoutEndpointsMsg:
        return handleGetChainInfosWithoutEndpointsMsg(
          chainsService,
          permissionInteractiveService
        )(env, msg as GetChainInfosWithoutEndpointsMsg);
      case GetChainInfoWithoutEndpointsMsg:
        return handleGetChainInfoWithoutEndpointsMsg(
          chainsService,
          permissionInteractiveService
        )(env, msg as GetChainInfoWithoutEndpointsMsg);
      case SuggestChainInfoMsg:
        return handleSuggestChainInfoMsg(
          chainsService,
          permissionService,
          permissionInteractiveService
        )(env, msg as SuggestChainInfoMsg);
      case NeedSuggestChainInfoInteractionMsg:
        return handleNeedSuggestChainInfoInteractionMsg(chainsService)(
          env,
          msg as NeedSuggestChainInfoInteractionMsg
        );
      case RemoveSuggestedChainInfoMsg:
        return handleRemoveSuggestedChainInfoMsg(chainsService)(
          env,
          msg as RemoveSuggestedChainInfoMsg
        );
      case SetChainEndpointsMsg:
        return handleSetChainEndpointsMsg(chainsService)(
          env,
          msg as SetChainEndpointsMsg
        );
      case ClearChainEndpointsMsg:
        return handleClearChainEndpointsMsg(chainsService)(
          env,
          msg as ClearChainEndpointsMsg
        );
      case GetChainOriginalEndpointsMsg:
        return handleGetChainOriginalEndpointsMsg(chainsService)(
          env,
          msg as GetChainOriginalEndpointsMsg
        );
      case ClearAllSuggestedChainInfosMsg:
        return handleClearAllSuggestedChainInfosMsg(chainsService)(
          env,
          msg as ClearAllSuggestedChainInfosMsg
        );
      case ClearAllChainEndpointsMsg:
        return handleClearAllChainEndpointsMsg(chainsService)(
          env,
          msg as ClearAllChainEndpointsMsg
        );
      default:
        throw new KeplrError("chains", 110, "Unknown msg type");
    }
  };
};

const handleGetInfosWithCoreTypesMsg: (
  service: ChainsService
) => InternalHandler<GetChainInfosWithCoreTypesMsg> = (service) => {
  return () => {
    return {
      chainInfos: service.getChainInfosWithCoreTypes(),
      modularChainInfos: service.getModularChainInfos(),
      endpointHealth: service.getEndpointHealthSnapshots(),
    };
  };
};

const handleGetChainInfosWithoutEndpointsMsg: (
  service: ChainsService,
  permissionInteractiveService: PermissionInteractiveService
) => InternalHandler<GetChainInfosWithoutEndpointsMsg> = (
  service,
  permissionInteractiveService
) => {
  return async (env, msg) => {
    await permissionInteractiveService.checkOrGrantGetChainInfosWithoutEndpointsPermission(
      env,
      msg.origin
    );

    const chainInfos = service.getChainInfosWithoutEndpoints();
    return {
      chainInfos,
    };
  };
};

const handleGetChainInfoWithoutEndpointsMsg: (
  service: ChainsService,
  permissionInteractiveService: PermissionInteractiveService
) => InternalHandler<GetChainInfoWithoutEndpointsMsg> = (
  service,
  permissionInteractiveService
) => {
  return async (env, msg) => {
    await permissionInteractiveService.ensureEnabled(
      env,
      [msg.chainId],
      msg.origin
    );

    const chainInfo = service.getChainInfoWithoutEndpoints(msg.chainId);

    return {
      chainInfo,
    };
  };
};

const handleSuggestChainInfoMsg: (
  chainsService: ChainsService,
  permissionService: PermissionService,
  permissionInteractiveService: PermissionInteractiveService
) => InternalHandler<SuggestChainInfoMsg> = (
  chainsService,
  permissionService,
  permissionInteractiveService
) => {
  return async (env, msg) => {
    const known = chainsService.getChainInfo(msg.chainInfo.chainId);
    if (known != null) {
      // Use the stored full identity and approved inventory, never the dapp's
      // suggested endpoint URLs. Existing permissions are unchanged.
      await chainsService
        .checkEndpointHealth(known.chainId, "connect")
        .catch(() => {
          console.warn("Could not check the known chain connection");
        });
      return;
    }

    await permissionInteractiveService.ensureKeyRingNotEmpty(env);

    const chainInfo = msg.chainInfo as Writeable<ChainInfo>;
    chainInfo.beta = true;

    await chainsService.suggestChainInfo(env, chainInfo, msg.origin);
    await chainsService
      .checkEndpointHealth(chainInfo.chainId, "connect")
      .catch(() => {
        console.warn("Could not check the approved chain connection");
      });

    permissionService.addPermission(
      [chainInfo.chainId],
      getBasicAccessPermissionType(),
      [msg.origin]
    );
  };
};

const handleNeedSuggestChainInfoInteractionMsg: (
  chainsService: ChainsService
) => InternalHandler<NeedSuggestChainInfoInteractionMsg> = (chainsService) => {
  return async (_env, msg) => {
    if (chainsService.getChainInfo(msg.chainInfo.chainId) != null) {
      // If suggested chain info is already registered, just return.
      return false;
    }

    return chainsService.needSuggestChainInfoInteraction(msg.origin);
  };
};

const handleRemoveSuggestedChainInfoMsg: (
  service: ChainsService
) => InternalHandler<RemoveSuggestedChainInfoMsg> = (service) => {
  return (_, msg) => {
    service.removeSuggestedChainInfo(msg.chainId);
    return {
      chainInfos: service.getChainInfosWithCoreTypes(),
      modularChainInfos: service.getModularChainInfos(),
    };
  };
};

const handleSetChainEndpointsMsg: (
  service: ChainsService
) => InternalHandler<SetChainEndpointsMsg> = (service) => {
  return (_, msg) => {
    service.setEndpoint(msg.chainId, {
      rpc: msg.rpc,
      rest: msg.rest,
      evmRpc: msg.evmRpc,
    });
    return {
      chainInfos: service.getChainInfosWithCoreTypes(),
      modularChainInfos: service.getModularChainInfos(),
    };
  };
};

const handleClearChainEndpointsMsg: (
  service: ChainsService
) => InternalHandler<ClearChainEndpointsMsg> = (service) => {
  return (_, msg) => {
    service.clearEndpoint(msg.chainId);
    return {
      chainInfos: service.getChainInfosWithCoreTypes(),
      modularChainInfos: service.getModularChainInfos(),
    };
  };
};

const handleGetChainOriginalEndpointsMsg: (
  service: ChainsService
) => InternalHandler<GetChainOriginalEndpointsMsg> = (service) => {
  return (_, msg) => {
    return service.getOriginalEndpoint(msg.chainId);
  };
};

const handleClearAllSuggestedChainInfosMsg: (
  service: ChainsService
) => InternalHandler<ClearAllSuggestedChainInfosMsg> = (service) => {
  return () => {
    return service.clearAllSuggestedChainInfos();
  };
};

const handleClearAllChainEndpointsMsg: (
  service: ChainsService
) => InternalHandler<ClearAllChainEndpointsMsg> = (service) => {
  return () => {
    return service.clearAllEndpoints();
  };
};
