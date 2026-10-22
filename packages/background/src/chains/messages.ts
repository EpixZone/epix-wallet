import { KeplrError, Message } from "@keplr-wallet/router";
import {
  ChainInfo,
  ChainInfoWithoutEndpoints,
  ModularChainInfo,
} from "@keplr-wallet/types";
import { ROUTE } from "./constants";
import { ChainInfoWithCoreTypes } from "./types";
import { EndpointHealthSnapshot } from "./endpoint-health";

export class PingMsg extends Message<void> {
  public static type() {
    return "keplr-ping";
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  override approveExternal(): boolean {
    return true;
  }

  type(): string {
    return PingMsg.type();
  }
}

export class GetChainInfosWithCoreTypesMsg extends Message<{
  chainInfos: ChainInfoWithCoreTypes[];
  modularChainInfos: ModularChainInfo[];
  endpointHealth: readonly EndpointHealthSnapshot[];
}> {
  public static type() {
    return "get-chain-infos-with-core-types";
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetChainInfosWithCoreTypesMsg.type();
  }
}

/** Internal extension controls. Webpages cannot select or authorize backups. */
export class CheckEndpointHealthMsg extends Message<void> {
  constructor(
    public readonly chainId?: string,
    public readonly recover = false
  ) {
    super();
  }
  static type() {
    return "check-endpoint-health";
  }
  type() {
    return CheckEndpointHealthMsg.type();
  }
  route() {
    return ROUTE;
  }
  validateBasic() {
    if (
      this.chainId !== undefined &&
      (typeof this.chainId !== "string" ||
        !this.chainId ||
        this.chainId.length > 128)
    ) {
      throw new KeplrError("chains", 101, "Invalid chain id");
    }
    if (typeof this.recover !== "boolean" || (this.recover && !this.chainId)) {
      throw new KeplrError("chains", 101, "Invalid recovery request");
    }
  }
}

export class SetEndpointPublicFallbackMsg extends Message<void> {
  constructor(
    public readonly chainId: string,
    public readonly enabled: boolean
  ) {
    super();
  }
  static type() {
    return "set-endpoint-public-fallback";
  }
  type() {
    return SetEndpointPublicFallbackMsg.type();
  }
  route() {
    return ROUTE;
  }
  validateBasic() {
    if (
      typeof this.chainId !== "string" ||
      !this.chainId ||
      this.chainId.length > 128 ||
      typeof this.enabled !== "boolean"
    ) {
      throw new KeplrError("chains", 101, "Invalid fallback preference");
    }
  }
}

/** Invalidation hint only; views fetch authoritative metadata after receipt. */
export class EndpointHealthChangedMsg extends Message<void> {
  static type() {
    return "endpoint-health-changed";
  }
  type() {
    return EndpointHealthChangedMsg.type();
  }
  route() {
    return "endpoint-health";
  }
  validateBasic() {
    /* No payload. */
  }
}

export class GetChainInfosWithoutEndpointsMsg extends Message<{
  chainInfos: ChainInfoWithoutEndpoints[];
}> {
  public static type() {
    return "get-chain-infos-without-endpoints";
  }

  validateBasic(): void {
    // noop
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetChainInfosWithoutEndpointsMsg.type();
  }
}

export class GetChainInfoWithoutEndpointsMsg extends Message<{
  chainInfo: ChainInfoWithoutEndpoints | undefined;
}> {
  public static type() {
    return "get-chain-info-without-endpoints";
  }

  constructor(public readonly chainId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new KeplrError("chains", 101, "Chain id not set");
    }
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetChainInfoWithoutEndpointsMsg.type();
  }
}

export class SuggestChainInfoMsg extends Message<void> {
  public static type() {
    return "suggest-chain-info";
  }

  constructor(public readonly chainInfo: ChainInfo) {
    super();
  }

  validateBasic(): void {
    if (!this.chainInfo) {
      throw new KeplrError("chains", 100, "Chain info not set");
    }
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SuggestChainInfoMsg.type();
  }
}

export class NeedSuggestChainInfoInteractionMsg extends Message<boolean> {
  public static type() {
    return "need-suggest-chain-info-interaction";
  }

  constructor(public readonly chainInfo: ChainInfo) {
    super();
  }

  validateBasic(): void {
    if (!this.chainInfo) {
      throw new KeplrError("chains", 100, "Chain info not set");
    }
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return NeedSuggestChainInfoInteractionMsg.type();
  }
}

export class RemoveSuggestedChainInfoMsg extends Message<{
  chainInfos: ChainInfoWithCoreTypes[];
  modularChainInfos: ModularChainInfo[];
}> {
  public static type() {
    return "remove-suggested-chain-info";
  }

  constructor(public readonly chainId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new KeplrError("chains", 101, "Chain id not set");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return RemoveSuggestedChainInfoMsg.type();
  }
}

export class SetChainEndpointsMsg extends Message<{
  chainInfos: ChainInfoWithCoreTypes[];
  modularChainInfos: ModularChainInfo[];
}> {
  public static type() {
    return "set-chain-endpoints";
  }

  constructor(
    public readonly chainId: string,
    public readonly rpc: string | undefined,
    public readonly rest: string | undefined,
    public readonly evmRpc: string | undefined
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new Error("Empty chain id");
    }

    if (this.rpc) {
      // Make sure that rpc is valid url form
      const url = new URL(this.rpc);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`RPC has invalid protocol: ${url.protocol}`);
      }
    }
    if (this.rest) {
      // Make sure that rest is valid url form
      const url = new URL(this.rest);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`LCD has invalid protocol: ${url.protocol}`);
      }
    }
    if (this.evmRpc) {
      // Make sure that evm rpc is valid url form
      const url = new URL(this.evmRpc);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`EVM RPC has invalid protocol: ${url.protocol}`);
      }
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SetChainEndpointsMsg.type();
  }
}

export class ClearChainEndpointsMsg extends Message<{
  chainInfos: ChainInfoWithCoreTypes[];
  modularChainInfos: ModularChainInfo[];
}> {
  public static type() {
    return "clear-chain-endpoints";
  }

  constructor(public readonly chainId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new Error("Empty chain id");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return ClearChainEndpointsMsg.type();
  }
}

export class GetChainOriginalEndpointsMsg extends Message<{
  rpc: string;
  rest?: string;
  evmRpc?: string;
}> {
  public static type() {
    return "get-chain-original-endpoints";
  }

  constructor(public readonly chainId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new Error("Empty chain id");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetChainOriginalEndpointsMsg.type();
  }
}

export class ClearAllSuggestedChainInfosMsg extends Message<void> {
  public static type() {
    return "clear-all-suggested-chain-infos";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    //noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return ClearAllSuggestedChainInfosMsg.type();
  }
}

export class ClearAllChainEndpointsMsg extends Message<void> {
  public static type() {
    return "clear-all-chain-endpoints";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    //noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return ClearAllChainEndpointsMsg.type();
  }
}
