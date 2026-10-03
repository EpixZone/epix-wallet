import { KVStore } from "@keplr-wallet/common";
import { Env } from "@keplr-wallet/router";
import { StdFee } from "@keplr-wallet/types";
import { Dec } from "@keplr-wallet/unit";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { Any } from "@keplr-wallet/proto-types/google/protobuf/any";
import { readStoredOperation } from "./storage";
import { PrepareEpixSwapMsg } from "./messages";
import {
  EpixSwapDirection,
  EpixSwapOperation,
  EpixSwapReview,
  EpixSwapStatus,
} from "./types";
import { SwapContext, SwapStep, SwapTransactions } from "./transactions";
import * as network from "./network";
import {
  APPROVAL_DURATION_MS,
  MAX_BRIDGE_GAS,
  MAX_SWAP_GAS,
  OSMOSIS_EPIX_DENOM,
  chainPair,
  osmosisRest,
  osmosisAddress,
  quoteSelection,
  assertFeeWithin,
  assertSelection,
  bridgeMessage,
  matchingPacketSequence,
  publicCopy,
  swapMessage,
} from "./plan";

interface ReviewPlan {
  review: EpixSwapReview;
  operation: EpixSwapOperation;
  resumeState?: string;
}

type FundingStatus = Pick<EpixSwapReview, "blockReason" | "feeShortfall">;

function feeFundingStatus(
  operation: EpixSwapOperation,
  available: bigint,
  required: bigint,
  blockReason: string
): FundingStatus {
  if (available >= required) return {};
  return {
    blockReason,
    feeShortfall: {
      denom: operation.feeDenom,
      available: available.toString(),
      required: required.toString(),
      shortfall: (required - available).toString(),
      address: osmosisAddress(operation),
    },
  };
}

function recoveryState(operation: EpixSwapOperation): string {
  return JSON.stringify([
    operation.status,
    operation.bridgeTxHash,
    operation.swapTxHash,
    operation.depositConfirmed,
    operation.swapConfirmed,
    operation.swapAmountOut,
  ]);
}
function finished(operation: EpixSwapOperation): boolean {
  return operation.status === "complete" || operation.status === "failed";
}

function initialStatus(
  direction: EpixSwapDirection,
  previous?: EpixSwapOperation
): EpixSwapStatus {
  if (direction === "to-epix")
    return previous?.swapConfirmed ? "bridging" : "swapping";
  return previous?.depositConfirmed ? "swapping" : "bridging";
}

function internal(env: Env): void {
  if (!env.isInternalMsg)
    throw new Error("Swap approval is available only inside the wallet.");
}
function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 300)
    : "Unable to continue. Review the swap again.";
}
function gasWithMargin(gasUsed: string): string {
  if (!/^[1-9]\d{0,15}$/.test(gasUsed))
    throw new TypeError("Invalid simulated gas");
  return ((BigInt(gasUsed) * BigInt(13) + BigInt(9)) / BigInt(10)).toString();
}
function bridgeFee(gas: string, price: string): StdFee {
  const gasPrice = new Dec(price);
  if (gasPrice.lte(new Dec(0))) throw new TypeError("Invalid Epix gas price");
  return {
    gas,
    amount: [
      {
        denom: "aepix",
        amount: gasPrice.mul(new Dec(gas)).roundUp().toString(),
      },
    ],
  };
}

/** A single internal approval authorizes only this bounded, two-message route. */
export class EpixSwapService {
  private readonly operations = new Map<string, EpixSwapOperation>();
  private readonly reviews = new Map<string, ReviewPlan>();
  private readonly approvals = new Map<string, EpixSwapOperation>();
  private readonly running = new Set<string>();
  private readonly verifiedSwaps = new Map<string, string>();
  private readonly verifiedReceipts = new Set<string>();
  private readonly refreshing = new Map<string, Promise<void>>();
  private writeTail: Promise<void> = Promise.resolve();
  private storageError = false;

  constructor(
    private readonly store: KVStore,
    private readonly transactions: SwapTransactions,
    private readonly api: typeof network = network
  ) {}

  async init(): Promise<void> {
    try {
      const saved = await this.store.get<EpixSwapOperation[]>("operations");
      if (saved && !Array.isArray(saved))
        throw new TypeError("Invalid swap history");
      for (const value of saved ?? []) {
        const operation = readStoredOperation(value);
        // Persistence is progress, never authorization. No automatic restart signing.
        if (operation.status !== "complete" && operation.status !== "failed") {
          operation.depositConfirmed = false;
          if (operation.direction === "to-epix") {
            operation.swapConfirmed = false;
            operation.swapAmountOut = undefined;
          }
          operation.status = "paused";
          operation.error =
            "Wallet restarted. Review again before further signing.";
        }
        this.operations.set(operation.id, operation);
      }
    } catch {
      this.storageError = true;
    }
    this.transactions.watchContext(() => this.revokeApprovals());
  }

  revokeApprovals(): void {
    this.approvals.clear();
    this.reviews.clear();
  }

  private save(): Promise<void> {
    const write = this.writeTail.then(() =>
      this.store.set("operations", publicCopy([...this.operations.values()]))
    );
    this.writeTail = write.catch(() => undefined);
    return write;
  }

  private get(id: string): EpixSwapOperation {
    const operation = this.operations.get(id);
    if (!operation) throw new Error("Swap operation not found.");
    return operation;
  }

  private assertAvailable(vaultId: string, exceptId?: string): void {
    if (this.storageError)
      throw new Error(
        "Swap recovery data is unavailable. Restore access before starting."
      );
    const other = [...this.operations.values()].some(
      (op) =>
        op.vaultId === vaultId &&
        op.id !== exceptId &&
        op.status !== "complete" &&
        op.status !== "failed"
    );
    if (other)
      throw new Error(
        "Finish or review the existing swap before starting another."
      );
  }

  async prepare(env: Env, msg: PrepareEpixSwapMsg): Promise<EpixSwapReview> {
    internal(env);
    msg.validateBasic();
    assertSelection(
      msg.direction,
      msg.inputDenom,
      msg.amountMinimal,
      msg.outputDenom,
      msg.slippageBps,
      msg.feeDenom
    );
    this.assertAvailable(msg.vaultId, msg.resumeOperationId);
    const context = await this.transactions.context(msg.vaultId, msg.direction);
    const previous = await this.prepareResume(msg, context);
    const resumeState = previous ? recoveryState(previous) : undefined;
    const now = Date.now();
    const operation = this.makeOperation(msg, context, previous, now);
    await this.validateRoute(operation);
    const { quote, expiresAt } = await this.prepareBounds(operation, context);
    const funding = await this.checkFunding(operation, context);
    const review: EpixSwapReview = {
      id: crypto.randomUUID(),
      direction: operation.direction,
      inputDenom: operation.inputDenom,
      sourceChainId: operation.sourceChainId,
      destinationChainId: operation.destinationChainId,
      expiresAt,
      executionExpiresAt: operation.expiresAt,
      sourceAddress: operation.sourceAddress,
      destinationAddress: operation.destinationAddress,
      amountIn: operation.amountIn,
      outputDenom: operation.outputDenom,
      estimatedAmountOut: quote.amountOut,
      minimumAmountOut: operation.minimumAmountOut,
      routes: quote.routes,
      bridgeComplete: operation.depositConfirmed,
      swapComplete: operation.swapConfirmed,
      swapAmountOut: operation.swapAmountOut,
      bridgeFee: operation.bridgeFee,
      swapFeeCap: operation.swapFeeCap,
      canStart: !funding.blockReason,
      ...funding,
      resumeOperationId: msg.resumeOperationId,
    };
    // Public callers receive copies and cannot mutate the held review or plan.
    this.reviews.set(
      review.id,
      publicCopy({
        review,
        operation,
        resumeState,
      })
    );
    return publicCopy(review);
  }

  private validateRoute(operation: EpixSwapOperation): Promise<void> {
    const [epix, osmosis] =
      operation.direction === "to-osmosis"
        ? [operation.sourceRest, operation.destinationRest]
        : [operation.destinationRest, operation.sourceRest];
    return this.api.validateBridgeRoute(epix, osmosis);
  }

  private feeQuote(operation: EpixSwapOperation, gas: string) {
    return this.api.getOsmosisFeeQuote({
      rest: osmosisRest(operation),
      gasLimit: Number(gas),
      feeDenom: operation.feeDenom,
      minimumBaseGasPrice: "0.03",
    });
  }

  private async prepareBounds(
    operation: EpixSwapOperation,
    context: SwapContext
  ) {
    // A completed reverse swap cannot be quoted again: its input is already spent.
    const quote = operation.swapConfirmed
      ? {
          amountOut: operation.swapAmountOut!,
          minimumAmountOut: operation.minimumAmountOut,
          routes: [],
          expiresAt: Date.now() + 30000,
        }
      : await this.api.fetchSwapQuote(quoteSelection(operation));
    if (!operation.swapConfirmed)
      operation.minimumAmountOut = quote.minimumAmountOut;
    operation.estimatedAmountOut = quote.amountOut;
    const swapFee = operation.swapConfirmed
      ? {
          fee: {
            gas: "0",
            amount: [{ denom: operation.feeDenom, amount: "0" }],
          },
          expiresAt: quote.expiresAt,
        }
      : await this.feeQuote(operation, MAX_SWAP_GAS);
    operation.swapFeeCap = swapFee.fee;
    let expiresAt = Math.min(quote.expiresAt, swapFee.expiresAt);
    if (operation.direction === "to-epix") {
      const bridge = await this.feeQuote(operation, MAX_BRIDGE_GAS);
      operation.bridgeFee = bridge.fee;
      expiresAt = Math.min(expiresAt, bridge.expiresAt);
    } else {
      operation.bridgeFee = operation.depositConfirmed
        ? { amount: [{ denom: "aepix", amount: "0" }], gas: "0" }
        : bridgeFee(MAX_BRIDGE_GAS, context.bridgeGasPrice);
    }
    return { quote, expiresAt };
  }

  private makeOperation(
    msg: PrepareEpixSwapMsg,
    context: SwapContext,
    previous: EpixSwapOperation | undefined,
    now: number
  ): EpixSwapOperation {
    return {
      id: previous?.id ?? crypto.randomUUID(),
      vaultId: msg.vaultId,
      direction: msg.direction,
      inputDenom: msg.inputDenom,
      ...chainPair(msg.direction),
      sourceAddress: context.sourceAddress,
      destinationAddress: context.destinationAddress,
      sourceRest: context.sourceRest,
      destinationRest: context.destinationRest,
      amountIn: msg.amountMinimal,
      outputDenom: msg.outputDenom,
      slippageBps: msg.slippageBps,
      feeDenom: msg.feeDenom,
      minimumAmountOut: previous?.minimumAmountOut ?? "0",
      estimatedAmountOut: "0",
      bridgeFee: { amount: [], gas: MAX_BRIDGE_GAS },
      swapFeeCap: { amount: [], gas: MAX_SWAP_GAS },
      status: initialStatus(msg.direction, previous),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      expiresAt: now + APPROVAL_DURATION_MS,
      bridgeTxHash: previous?.bridgeTxHash,
      swapTxHash: previous?.swapTxHash,
      swapConfirmed: previous?.swapConfirmed,
      swapAmountOut: previous?.swapAmountOut,
      packetSequence: previous?.packetSequence,
      packetTimeoutTimestamp:
        (previous?.bridgeTxHash
          ? previous.packetTimeoutTimestamp
          : undefined) ??
        (BigInt(now + 10 * 60 * 1000) * BigInt(1000000)).toString(),
      depositConfirmed: previous?.depositConfirmed ?? false,
    };
  }

  private async prepareResume(
    msg: PrepareEpixSwapMsg,
    context: SwapContext
  ): Promise<EpixSwapOperation | undefined> {
    if (!msg.resumeOperationId) return undefined;
    if (
      this.running.has(msg.resumeOperationId) ||
      this.approvals.has(msg.resumeOperationId)
    )
      throw new Error("This swap is already running.");
    const operation = this.get(msg.resumeOperationId);
    if (
      operation.vaultId !== msg.vaultId ||
      operation.direction !== msg.direction ||
      operation.inputDenom !== msg.inputDenom ||
      operation.sourceAddress !== context.sourceAddress ||
      operation.destinationAddress !== context.destinationAddress ||
      operation.amountIn !== msg.amountMinimal ||
      operation.outputDenom !== msg.outputDenom
    )
      throw new Error("The recovery plan does not match this swap.");
    if (finished(operation)) throw new Error("This swap has already finished.");
    await this.refreshStatus(operation);
    if (finished(operation)) throw new Error("This swap has already finished.");
    if (
      (operation.swapTxHash && !operation.swapConfirmed) ||
      (operation.bridgeTxHash && !operation.depositConfirmed)
    )
      throw new Error(
        "The previous transaction is still unconfirmed. Refresh its status before continuing."
      );
    return operation;
  }

  private assertAddresses(
    operation: EpixSwapOperation,
    context: SwapContext
  ): void {
    if (
      context.sourceAddress !== operation.sourceAddress ||
      context.destinationAddress !== operation.destinationAddress
    )
      throw new Error("The reviewed signing account changed.");
  }

  private async checkFunding(
    operation: EpixSwapOperation,
    context: SwapContext
  ): Promise<FundingStatus> {
    this.assertAddresses(operation, context);
    if (!context.software)
      return {
        blockReason: "This one-confirmation flow requires a software wallet.",
      };
    if (!context.enabled)
      return {
        blockReason:
          "Enable Osmosis before starting so the received assets are visible.",
      };
    if (operation.direction === "to-epix")
      return this.checkReverseFunding(operation);
    const inputRest = operation.depositConfirmed
      ? operation.destinationRest
      : operation.sourceRest;
    const inputAddress = operation.depositConfirmed
      ? operation.destinationAddress
      : operation.sourceAddress;
    const inputDenom = operation.depositConfirmed
      ? OSMOSIS_EPIX_DENOM
      : "aepix";
    const [input, feeBalance] = await Promise.all([
      this.api.readBalance(inputRest, inputAddress, inputDenom),
      this.api.readBalance(
        operation.destinationRest,
        operation.destinationAddress,
        operation.feeDenom
      ),
    ]);
    const requiredInput =
      BigInt(operation.amountIn) +
      (operation.depositConfirmed
        ? BigInt(0)
        : BigInt(operation.bridgeFee.amount[0].amount));
    if (BigInt(input) < requiredInput)
      return {
        blockReason: "Insufficient EPIX for the amount and bridge fee.",
      };
    return feeFundingStatus(
      operation,
      BigInt(feeBalance),
      BigInt(operation.swapFeeCap.amount[0].amount),
      "Fund the selected Osmosis fee asset before starting. Swap output cannot pay its own initial fee."
    );
  }

  private async checkReverseFunding(
    operation: EpixSwapOperation
  ): Promise<FundingStatus> {
    const inputDenom = operation.swapConfirmed
      ? OSMOSIS_EPIX_DENOM
      : operation.inputDenom;
    const amount = operation.swapConfirmed
      ? operation.swapAmountOut!
      : operation.amountIn;
    const fees =
      BigInt(operation.bridgeFee.amount[0].amount) +
      (operation.swapConfirmed
        ? BigInt(0)
        : BigInt(operation.swapFeeCap.amount[0].amount));
    const inputBalance = this.api.readBalance(
      operation.sourceRest,
      operation.sourceAddress,
      inputDenom
    );
    const sameAsset = inputDenom === operation.feeDenom;
    const feeBalance = sameAsset
      ? inputBalance
      : this.api.readBalance(
          operation.sourceRest,
          operation.sourceAddress,
          operation.feeDenom
        );
    const [input, fee] = await Promise.all([inputBalance, feeBalance]);
    if (BigInt(input) < BigInt(amount))
      return {
        blockReason:
          "Insufficient input for the swap amount and approved fees.",
      };
    const available = BigInt(fee) - (sameAsset ? BigInt(amount) : BigInt(0));
    return feeFundingStatus(
      operation,
      available,
      fees,
      "Fund the selected Osmosis fee asset for both the swap and return transfer before starting."
    );
  }

  async start(env: Env, reviewId: string): Promise<EpixSwapOperation> {
    internal(env);
    const plan = this.reviews.get(reviewId);
    if (!plan || !plan.review.canStart || Date.now() >= plan.review.expiresAt)
      throw new Error(
        "This review expired or cannot start. Request a fresh review."
      );
    const operation = publicCopy(plan.operation);
    this.assertAvailable(operation.vaultId, plan.review.resumeOperationId);
    if (this.running.has(operation.id) || this.approvals.has(operation.id))
      throw new Error("This swap is already running.");
    this.transactions.assertContext(operation);
    if (plan.review.resumeOperationId) {
      const current = this.get(plan.review.resumeOperationId);
      if (finished(current) || recoveryState(current) !== plan.resumeState)
        throw new Error("Swap progress changed. Request a fresh review.");
    }
    for (const [id, cached] of this.reviews) {
      if (cached.operation.vaultId === operation.vaultId)
        this.reviews.delete(id);
    }
    this.operations.set(operation.id, operation);
    this.approvals.set(operation.id, publicCopy(operation));
    try {
      await this.save();
    } catch (error) {
      await this.pause(operation, error);
      throw error;
    }
    this.launch(operation.id);
    return publicCopy(operation);
  }

  getOperations(env: Env, vaultId: string): EpixSwapOperation[] {
    internal(env);
    return publicCopy(
      [...this.operations.values()].filter((op) => op.vaultId === vaultId)
    );
  }

  async refresh(env: Env, id: string): Promise<EpixSwapOperation> {
    internal(env);
    const operation = this.get(id);
    // The running worker owns mutations while it signs or dispatches.
    if (!this.running.has(id)) {
      await this.refreshStatus(operation);
    }
    return publicCopy(operation);
  }

  private refreshStatus(operation: EpixSwapOperation): Promise<void> {
    const pending = this.refreshing.get(operation.id);
    if (pending) return pending;
    const request = this.observe(operation)
      .then(() => this.save())
      .finally(() => {
        this.refreshing.delete(operation.id);
      });
    this.refreshing.set(operation.id, request);
    return request;
  }

  private guard(operation: EpixSwapOperation): void {
    if (!this.approvals.has(operation.id) || Date.now() >= operation.expiresAt)
      throw new Error("Approval ended. Review again before further signing.");
    this.transactions.assertContext(operation);
  }

  private launch(id: string): void {
    if (this.running.has(id)) return;
    this.running.add(id);
    void this.run(id)
      .catch((error) => this.pause(this.get(id), error))
      .finally(() => {
        this.running.delete(id);
        const op = this.get(id);
        if (op.status === "waiting-for-deposit" || op.status === "swapping") {
          if (this.approvals.has(id)) setTimeout(() => this.launch(id), 5000);
        }
      });
  }

  private async pause(
    operation: EpixSwapOperation,
    error: unknown
  ): Promise<void> {
    this.approvals.delete(operation.id);
    operation.status = "paused";
    operation.error = errorText(error);
    operation.updatedAt = Date.now();
    // Failure to persist a status must never trigger another send.
    await this.save().catch(() => {
      this.storageError = true;
    });
  }

  private async run(id: string): Promise<void> {
    const operation = this.get(id);
    await this.refreshing.get(id);
    this.guard(operation);
    await this.observe(operation);
    if (finished(operation)) {
      this.approvals.delete(id);
      await this.save();
      return;
    }
    this.guard(operation);
    if (operation.direction === "to-epix") await this.runReverse(operation);
    else await this.runForward(operation);
  }

  private async runForward(operation: EpixSwapOperation): Promise<void> {
    if (
      operation.swapTxHash ||
      (operation.bridgeTxHash && !operation.depositConfirmed)
    ) {
      await this.save();
      return;
    }
    if (!operation.depositConfirmed) await this.sendBridge(operation);
    else await this.sendSwap(operation);
  }

  private async runReverse(operation: EpixSwapOperation): Promise<void> {
    if (
      operation.bridgeTxHash ||
      (operation.swapTxHash && !operation.swapConfirmed)
    ) {
      await this.save();
      return;
    }
    if (!operation.swapConfirmed) await this.sendSwap(operation);
    else await this.sendBridge(operation);
  }

  private async sendBridge(operation: EpixSwapOperation): Promise<void> {
    await this.validateRoute(operation);
    const context = await this.transactions.context(
      operation.vaultId,
      operation.direction
    );
    const funding = await this.checkFunding(operation, context);
    if (funding.blockReason) throw new Error(funding.blockReason);
    const message = bridgeMessage(operation);
    const gas = gasWithMargin(
      await this.transactions.simulate(
        operation,
        "bridge",
        message,
        operation.bridgeFee
      )
    );
    const feeQuote =
      operation.direction === "to-epix"
        ? await this.feeQuote(operation, gas)
        : {
            fee: bridgeFee(gas, context.bridgeGasPrice),
            expiresAt: operation.expiresAt,
          };
    assertFeeWithin(feeQuote.fee, operation.bridgeFee);
    await this.dispatch(
      operation,
      "bridge",
      message,
      feeQuote.fee,
      feeQuote.expiresAt
    );
    operation.status = "waiting-for-deposit";
    await this.save();
  }

  private async sendSwap(operation: EpixSwapOperation): Promise<void> {
    const quote = await this.api.fetchSwapQuote(quoteSelection(operation));
    if (BigInt(quote.minimumAmountOut) < BigInt(operation.minimumAmountOut))
      throw new Error(
        "The new quote falls below the approved minimum. Review again."
      );
    const message = swapMessage(operation, quote.routes);
    const gas = gasWithMargin(
      await this.transactions.simulate(
        operation,
        "swap",
        message,
        operation.swapFeeCap
      )
    );
    if (BigInt(gas) > BigInt(MAX_SWAP_GAS))
      throw new Error(
        "The swap requires more gas than approved. Review again."
      );
    const feeQuote = await this.feeQuote(operation, gas);
    assertFeeWithin(feeQuote.fee, operation.swapFeeCap);
    const context = await this.transactions.context(
      operation.vaultId,
      operation.direction
    );
    const funding = await this.checkFunding(operation, context);
    if (funding.blockReason) throw new Error(funding.blockReason);
    const freshUntil = Math.min(quote.expiresAt, feeQuote.expiresAt);
    await this.dispatch(operation, "swap", message, feeQuote.fee, freshUntil);
    operation.status = "swapping";
    await this.save();
  }

  private async dispatch(
    operation: EpixSwapOperation,
    step: SwapStep,
    message: Any,
    fee: StdFee,
    freshUntil = operation.expiresAt
  ): Promise<void> {
    const guard = () => {
      this.guard(operation);
      if (
        step === "bridge" &&
        BigInt(Date.now()) * BigInt(1000000) >=
          BigInt(operation.packetTimeoutTimestamp!)
      )
        throw new Error("The deposit timeout expired. Review again.");
      if (Date.now() >= freshUntil)
        throw new Error("The quote or fee expired. Review again.");
    };
    guard();
    const signed = await this.transactions.sign(
      operation,
      step,
      message,
      fee,
      guard
    );
    guard();
    const hash = bytesToHex(sha256(signed)).toUpperCase();
    const key = step === "bridge" ? "bridgeTxHash" : "swapTxHash";
    operation[key] = hash;
    try {
      // Persist the exact public hash before dispatch. Signed bytes never enter storage.
      await this.save();
      guard();
    } catch (error) {
      delete operation[key]; // This attempt is definitely unsent.
      throw error;
    }
    // From this point a transport error is ambiguous. Keep the hash and never resend.
    const returnedHash = await this.transactions.broadcast(
      operation,
      step,
      signed
    );
    if (bytesToHex(returnedHash).toUpperCase() !== hash)
      throw new Error(
        "Unexpected transaction hash. Refresh before continuing."
      );
    // Revocation during the network request preserves the sent hash, but must
    // leave lookup-only recovery instead of an active state without a worker.
    this.guard(operation);
  }

  private async observe(operation: EpixSwapOperation): Promise<void> {
    if (operation.direction === "to-epix") {
      await this.observeReverseSwap(operation);
      if (!operation.swapConfirmed) return;
    } else if (operation.swapTxHash) return this.observeSwap(operation);
    return this.observeBridge(operation);
  }

  private async observeBridge(operation: EpixSwapOperation): Promise<void> {
    if (!operation.bridgeTxHash) return;
    if (this.verifiedReceipts.has(operation.id)) {
      operation.depositConfirmed = true;
      if (operation.direction === "to-epix") operation.status = "complete";
      return;
    }
    const tx = await this.api.lookupTx(
      operation.sourceRest,
      operation.bridgeTxHash
    );
    if (!tx) return;
    if (tx.code !== 0) {
      this.bridgeFailed(operation);
      return;
    }
    operation.packetSequence = matchingPacketSequence(tx.events, operation);
    const ack = await this.api.packetAck(
      operation.destinationRest,
      operation.packetSequence,
      undefined,
      operation.direction
    );
    operation.depositConfirmed = ack === "received";
    if (operation.depositConfirmed) {
      this.verifiedReceipts.add(operation.id);
      if (operation.direction === "to-epix") {
        operation.status = "complete";
        operation.error = undefined;
      }
    }
    if (ack === "unknown")
      throw new Error(
        "The transfer acknowledgement needs review. No further transaction will be sent."
      );
    if (
      ack === "pending" &&
      BigInt(Date.now()) * BigInt(1000000) >=
        BigInt(operation.packetTimeoutTimestamp!)
    )
      throw new Error(
        "The deposit timed out or is awaiting relay/refund. Check its status before continuing."
      );
    operation.updatedAt = Date.now();
  }

  private bridgeFailed(operation: EpixSwapOperation): void {
    if (operation.direction === "to-osmosis") {
      operation.status = "failed";
      operation.error = "The deposit failed on-chain. No swap was sent.";
      return;
    }
    operation.status = "paused";
    operation.error =
      "The return transfer failed on-chain. Review again to transfer the verified swap output.";
    delete operation.bridgeTxHash;
    delete operation.packetSequence;
    this.approvals.delete(operation.id);
  }

  private async observeReverseSwap(
    operation: EpixSwapOperation
  ): Promise<void> {
    if (!operation.swapTxHash) return;
    const verified = this.verifiedSwaps.get(operation.swapTxHash);
    if (verified) {
      operation.swapConfirmed = true;
      operation.swapAmountOut = verified;
      return;
    }
    const tx = await this.api.lookupSwapResult(
      operation.sourceRest,
      operation.swapTxHash,
      {
        sender: operation.sourceAddress,
        inputDenom: operation.inputDenom,
        amountIn: operation.amountIn,
        minimumAmountOut: operation.minimumAmountOut,
        outputDenom: OSMOSIS_EPIX_DENOM,
      }
    );
    if (!tx) return;
    if (tx.code !== 0) {
      operation.status = "failed";
      operation.error =
        "The swap failed on-chain. No return transfer was sent.";
      return;
    }
    if (!tx.amountOut)
      throw new Error("The received swap output could not be verified.");
    this.verifiedSwaps.set(operation.swapTxHash, tx.amountOut);
    operation.swapAmountOut = tx.amountOut;
    operation.swapConfirmed = true;
    operation.updatedAt = Date.now();
  }

  private async observeSwap(operation: EpixSwapOperation): Promise<void> {
    const tx = await this.api.lookupTx(
      operation.destinationRest,
      operation.swapTxHash!
    );
    if (!tx) return;
    if (tx.code === 0) {
      operation.status = "complete";
      operation.error = undefined;
    } else {
      operation.status = "paused";
      operation.error =
        "The swap failed on-chain. Review again to retry the remaining swap.";
      delete operation.swapTxHash;
      this.approvals.delete(operation.id);
    }
    operation.updatedAt = Date.now();
  }
}
