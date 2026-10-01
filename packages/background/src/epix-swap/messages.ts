import { Message } from "@keplr-wallet/router";
import { ROUTE } from "./constants";
import { EpixSwapOperation, EpixSwapReview } from "./types";

function requireId(value: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new TypeError("Invalid swap identifier");
  }
}

export class PrepareEpixSwapMsg extends Message<EpixSwapReview> {
  public static type() {
    return "prepare-epix-swap";
  }
  constructor(
    public readonly vaultId: string,
    public readonly amountMinimal: string,
    public readonly outputDenom: string,
    public readonly slippageBps: number,
    public readonly feeDenom: string,
    public readonly resumeOperationId?: string
  ) {
    super();
  }
  validateBasic(): void {
    requireId(this.vaultId);
    if (!/^[1-9]\d{0,77}$/.test(this.amountMinimal))
      throw new TypeError("Invalid swap amount");
    if (
      !Number.isInteger(this.slippageBps) ||
      this.slippageBps < 1 ||
      this.slippageBps > 500
    )
      throw new TypeError("Invalid slippage");
    if (
      typeof this.outputDenom !== "string" ||
      this.outputDenom.length > 200 ||
      typeof this.feeDenom !== "string" ||
      this.feeDenom.length > 200
    )
      throw new TypeError("Invalid denomination");
    if (this.resumeOperationId !== undefined) requireId(this.resumeOperationId);
  }
  override approveExternal(): boolean {
    return false;
  }
  route(): string {
    return ROUTE;
  }
  type(): string {
    return PrepareEpixSwapMsg.type();
  }
}

export class StartEpixSwapMsg extends Message<EpixSwapOperation> {
  public static type() {
    return "start-epix-swap";
  }
  constructor(public readonly reviewId: string) {
    super();
  }
  validateBasic(): void {
    requireId(this.reviewId);
  }
  override approveExternal(): boolean {
    return false;
  }
  route(): string {
    return ROUTE;
  }
  type(): string {
    return StartEpixSwapMsg.type();
  }
}

export class GetEpixSwapsMsg extends Message<EpixSwapOperation[]> {
  public static type() {
    return "get-epix-swaps";
  }
  constructor(public readonly vaultId: string) {
    super();
  }
  validateBasic(): void {
    requireId(this.vaultId);
  }
  override approveExternal(): boolean {
    return false;
  }
  route(): string {
    return ROUTE;
  }
  type(): string {
    return GetEpixSwapsMsg.type();
  }
}

export class RefreshEpixSwapMsg extends Message<EpixSwapOperation> {
  public static type() {
    return "refresh-epix-swap";
  }
  constructor(public readonly id: string) {
    super();
  }
  validateBasic(): void {
    requireId(this.id);
  }
  override approveExternal(): boolean {
    return false;
  }
  route(): string {
    return ROUTE;
  }
  type(): string {
    return RefreshEpixSwapMsg.type();
  }
}
