import { ChainGetter, QuerySharedContext } from "@keplr-wallet/stores";
import { computed, makeObservable } from "mobx";
import {
  ObservableEvmChainJsonRpcQuery,
  ObservableEvmChainJsonRpcQueryMap,
} from "./evm-chain-json-rpc";

interface EthTxReceiptResult {
  to: string | null;
  from: string;
  gasUsed: string;
  effectiveGasPrice: string;
  status: string;
  transactionHash: string;
  blockNumber: string;
  // OP Stack L2 chains include l1Fee in receipt
  l1Fee?: string;
}

export class ObservableQueryEthereumTxReceiptInner extends ObservableEvmChainJsonRpcQuery<EthTxReceiptResult> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    txHash: string
  ) {
    super(sharedContext, chainId, chainGetter, "eth_getTransactionReceipt", [
      txHash,
    ]);

    makeObservable(this);
  }

  @computed
  get receipt(): EthTxReceiptResult | undefined {
    if (!this.response || this.response.data == null) {
      return undefined;
    }

    return this.response.data;
  }

  @computed
  get to(): string | undefined {
    return this.receipt?.to ?? undefined;
  }

  @computed
  get txFee(): string | undefined {
    const receipt = this.receipt;
    if (!receipt) {
      return undefined;
    }

    try {
      const gasUsed = BigInt(receipt.gasUsed);
      const effectiveGasPrice = BigInt(receipt.effectiveGasPrice);
      const baseFee = effectiveGasPrice * gasUsed;
      const l1Fee = receipt.l1Fee ? BigInt(receipt.l1Fee) : BigInt(0);

      return (baseFee + l1Fee).toString();
    } catch {
      return undefined;
    }
  }
}

export class ObservableQueryEthereumTxReceipt extends ObservableEvmChainJsonRpcQueryMap<EthTxReceiptResult> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super(sharedContext, chainId, chainGetter, (txHash: string) => {
      return new ObservableQueryEthereumTxReceiptInner(
        this.sharedContext,
        this.chainId,
        this.chainGetter,
        txHash
      );
    });
  }

  getQueryByTxHash(txHash: string): ObservableQueryEthereumTxReceiptInner {
    return this.get(txHash) as ObservableQueryEthereumTxReceiptInner;
  }
}
