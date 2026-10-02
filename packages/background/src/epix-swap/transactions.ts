import { reaction } from "mobx";
import { BaseAccount } from "@keplr-wallet/cosmos";
import { Any } from "@keplr-wallet/proto-types/google/protobuf/any";
import { TxRaw } from "@keplr-wallet/proto-types/cosmos/tx/v1beta1/tx";
import { StdFee } from "@keplr-wallet/types";
import { Buffer } from "buffer/";
import { ChainsService } from "../chains/service";
import { ChainsUIService } from "../chains-ui/service";
import { KeyRingCosmosService } from "../keyring-cosmos/service";
import { KeyRingService } from "../keyring/service";
import { BackgroundTxService } from "../tx/service";
import { prepareSignDocForDirectSigning } from "../tx-executor/utils/cosmos";
import { EPIX_CHAIN_ID, OSMOSIS_CHAIN_ID } from "./constants";
import { EpixSwapDirection, EpixSwapOperation } from "./types";
import { chainPair, osmosisAddress, osmosisRest } from "./plan";
import { simulateTx } from "./network";

export interface SwapContext {
  sourceAddress: string;
  destinationAddress: string;
  sourceRest: string;
  destinationRest: string;
  bridgeGasPrice: string;
  software: boolean;
  enabled: boolean;
}
export type SwapStep = "bridge" | "swap";
export interface SwapTransactions {
  watchContext(onChange: () => void): void;
  context(vaultId: string, direction: EpixSwapDirection): Promise<SwapContext>;
  assertContext(operation: EpixSwapOperation): void;
  simulate(
    operation: EpixSwapOperation,
    step: SwapStep,
    message: Any,
    fee: StdFee
  ): Promise<string>;
  sign(
    operation: EpixSwapOperation,
    step: SwapStep,
    message: Any,
    fee: StdFee,
    guard: () => void
  ): Promise<Uint8Array>;
  broadcast(
    operation: EpixSwapOperation,
    step: SwapStep,
    bytes: Uint8Array
  ): Promise<Uint8Array>;
}

/** Only the service's two constructed messages can reach this private signer. */
export class EpixSwapTransactions implements SwapTransactions {
  constructor(
    private readonly chains: ChainsService,
    private readonly chainsUI: ChainsUIService,
    private readonly keys: KeyRingService,
    private readonly cosmos: KeyRingCosmosService,
    private readonly tx: BackgroundTxService
  ) {}

  watchContext(onChange: () => void): void {
    reaction(() => {
      if (this.keys.keyRingStatus !== "unlocked")
        return this.keys.keyRingStatus;
      const id = this.keys.selectedVaultId;
      return JSON.stringify([id, this.keys.getKeyInfo(id)?.insensitive]);
    }, onChange);
  }

  private assertSelected(vaultId: string): void {
    if (
      this.keys.keyRingStatus !== "unlocked" ||
      this.keys.selectedVaultId !== vaultId
    ) {
      throw new Error("Unlock and select the reviewed wallet to continue.");
    }
  }

  async context(
    vaultId: string,
    direction: EpixSwapDirection
  ): Promise<SwapContext> {
    this.assertSelected(vaultId);
    const [source, destination] = await Promise.all([
      this.cosmos.getKey(vaultId, EPIX_CHAIN_ID),
      this.cosmos.getKey(vaultId, OSMOSIS_CHAIN_ID),
    ]);
    this.assertSelected(vaultId);
    const sourceChain = this.chains.getChainInfoOrThrow(EPIX_CHAIN_ID);
    const currency = sourceChain.feeCurrencies.find(
      (c) => c.coinMinimalDenom === "aepix"
    );
    if (!currency?.gasPriceStep)
      throw new Error("Epix fee configuration is unavailable.");
    return {
      sourceAddress:
        direction === "to-osmosis"
          ? source.bech32Address
          : destination.bech32Address,
      destinationAddress:
        direction === "to-osmosis"
          ? destination.bech32Address
          : source.bech32Address,
      sourceRest: this.chains.getChainInfoOrThrow(
        chainPair(direction).sourceChainId
      ).rest,
      destinationRest: this.chains.getChainInfoOrThrow(
        chainPair(direction).destinationChainId
      ).rest,
      bridgeGasPrice: currency.gasPriceStep.average.toString(),
      software:
        !source.isNanoLedger &&
        !source.isKeystone &&
        !destination.isNanoLedger &&
        !destination.isKeystone,
      enabled: this.chainsUI.isEnabled(vaultId, OSMOSIS_CHAIN_ID),
    };
  }

  assertContext(operation: EpixSwapOperation): void {
    this.assertSelected(operation.vaultId);
    const type = this.keys.getKeyInfo(operation.vaultId)?.type;
    if (type !== "mnemonic" && type !== "private-key")
      throw new Error("This flow requires a software wallet.");
    if (!this.chainsUI.isEnabled(operation.vaultId, OSMOSIS_CHAIN_ID))
      throw new Error("Enable Osmosis before starting.");
    if (
      operation.sourceChainId !==
        chainPair(operation.direction).sourceChainId ||
      operation.destinationChainId !==
        chainPair(operation.direction).destinationChainId ||
      this.chains.getChainInfoOrThrow(operation.sourceChainId).rest !==
        operation.sourceRest ||
      this.chains.getChainInfoOrThrow(operation.destinationChainId).rest !==
        operation.destinationRest
    )
      throw new Error("Network settings changed. Review again.");
  }

  private async document(
    operation: EpixSwapOperation,
    step: SwapStep,
    message: Any,
    fee: StdFee
  ) {
    const chainId =
      step === "bridge" ? operation.sourceChainId : OSMOSIS_CHAIN_ID;
    const signer =
      step === "bridge" ? operation.sourceAddress : osmosisAddress(operation);
    const key = await this.cosmos.getKey(operation.vaultId, chainId);
    if (key.bech32Address !== signer || key.isNanoLedger || key.isKeystone)
      throw new Error("The reviewed signing account changed.");
    const chainInfo = this.chains.getChainInfoOrThrow(chainId);
    const account = await BaseAccount.fetchFromRest(
      chainInfo.rest,
      signer,
      true
    );
    return {
      chainId,
      signer,
      ...prepareSignDocForDirectSigning({
        chainInfo,
        accountNumber: account.getAccountNumber().toString(),
        sequence: account.getSequence().toString(),
        protoMsgs: [message],
        fee,
        memo: "",
        pubKey: key.pubKey,
      }),
    };
  }

  async simulate(
    operation: EpixSwapOperation,
    step: SwapStep,
    message: Any,
    fee: StdFee
  ): Promise<string> {
    const doc = await this.document(operation, step, message, fee);
    const bytes = TxRaw.encode({
      bodyBytes: doc.bodyBytes,
      authInfoBytes: doc.authInfoBytes,
      signatures: [new Uint8Array(64)],
    }).finish();
    return simulateTx(
      step === "bridge" ? operation.sourceRest : osmosisRest(operation),
      bytes
    );
  }

  async sign(
    operation: EpixSwapOperation,
    step: SwapStep,
    message: Any,
    fee: StdFee,
    guard: () => void
  ): Promise<Uint8Array> {
    const doc = await this.document(operation, step, message, fee);
    guard();
    const origin =
      typeof browser === "undefined"
        ? "extension"
        : new URL(browser.runtime.getURL("/")).origin;
    const { signature } = await this.cosmos.signDirectPreAuthorized(
      origin,
      operation.vaultId,
      doc.chainId,
      doc.signer,
      doc.signDoc
    );
    guard();
    return TxRaw.encode({
      bodyBytes: doc.bodyBytes,
      authInfoBytes: doc.authInfoBytes,
      signatures: [Buffer.from(signature.signature, "base64")],
    }).finish();
  }

  broadcast(
    operation: EpixSwapOperation,
    step: SwapStep,
    bytes: Uint8Array
  ): Promise<Uint8Array> {
    return this.tx.sendTx(
      step === "bridge" ? operation.sourceChainId : OSMOSIS_CHAIN_ID,
      bytes,
      "sync",
      { silent: true, skipTracingTxResult: true }
    );
  }
}
