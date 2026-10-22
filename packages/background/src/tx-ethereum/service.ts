import { ChainsService } from "../chains";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { Notification } from "../tx/types";
import { EthTxReceipt } from "@keplr-wallet/types";
import { retry } from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";

export class BackgroundTxEthereumService {
  constructor(
    protected readonly chainsService: ChainsService,
    protected readonly notification: Notification
  ) {}

  async init(): Promise<void> {
    // noop
  }

  async sendEthereumTx(
    origin: string,
    chainId: string,
    tx: Uint8Array,
    options: {
      silent?: boolean;
      skipTracingTxResult?: boolean;
      onFulfill?: (txReceipt: EthTxReceipt) => void;
    }
  ): Promise<string> {
    if (!options.silent) {
      this.notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Tx is pending...",
        message: "Wait a second",
      });
    }

    let submissionAttempted = false;
    let submissionRejected = false;
    try {
      const modularChainInfo =
        this.chainsService.getModularChainInfoOrThrow(chainId);
      if (
        modularChainInfo.type !== "evm" &&
        modularChainInfo.type !== "ethermint"
      ) {
        throw new Error(`Not an EVM chain: ${chainId}`);
      }
      const evmInfo = modularChainInfo.evm;
      const body = JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_sendRawTransaction",
        params: [`0x${Buffer.from(tx).toString("hex")}`],
        id: 1,
      });

      // The broadcast keeps its captured endpoint and is never retried.
      submissionAttempted = true;

      const sendRawTransactionResponse = await simpleFetch<{
        result?: string;
        error?: Error;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      }>(evmInfo.rpc, "", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "request-source": origin,
        },
        body,
      });

      const txHash = sendRawTransactionResponse.data.result;
      if (sendRawTransactionResponse.data.error) {
        submissionRejected = true;
        throw sendRawTransactionResponse.data.error;
      }
      if (!txHash) throw new Error("No tx hash responded");

      if (options.skipTracingTxResult) {
        return txHash;
      }

      this.waitForReceipt(origin, chainId, modularChainInfo.chainId, txHash)
        .then((txReceipt) => {
          this.getReceiptNetwork(chainId, modularChainInfo.chainId);
          if (!txReceipt) return;
          options.onFulfill?.(txReceipt);
          if (!options.silent) {
            BackgroundTxEthereumService.processTxResultNotification(
              this.notification
            );
          }
        })
        .catch((e) => {
          console.error("Transaction confirmation is unavailable", txHash, e);
        });

      return txHash;
    } catch (e) {
      if (submissionAttempted && !submissionRejected) {
        const unknown = new Error(
          `Transaction submission outcome is unknown. Check its status before sending again. ${e.message}`
        );
        if (!options.silent) {
          this.notification.create({
            iconRelativeUrl: "assets/logo-256.png",
            title: "Tx status unknown",
            message: unknown.message,
          });
        }
        throw unknown;
      }
      console.error(e);
      if (!options.silent) {
        BackgroundTxEthereumService.processTxErrorNotification(
          this.notification,
          e
        );
      }
      throw e;
    }
  }

  async getEthereumTxReceipt(
    origin: string,
    chainId: string,
    txHash: string
  ): Promise<EthTxReceipt | null> {
    const modularChainInfo =
      this.chainsService.getModularChainInfoOrThrow(chainId);
    if (
      modularChainInfo.type !== "evm" &&
      modularChainInfo.type !== "ethermint"
    ) {
      return null;
    }
    if (
      chainId !== modularChainInfo.chainId &&
      chainId !== ChainIdHelper.parse(modularChainInfo.chainId).identifier
    ) {
      throw new Error("The transaction's network has changed");
    }
    return this.waitForReceipt(
      origin,
      chainId,
      modularChainInfo.chainId,
      txHash
    );
  }

  private getReceiptNetwork(chainId: string, expectedChainId: string) {
    const current = this.chainsService.getModularChainInfoOrThrow(chainId);
    if (
      current.chainId !== expectedChainId ||
      (current.type !== "evm" && current.type !== "ethermint")
    ) {
      throw new Error("The transaction's network has changed");
    }
    return current;
  }

  private waitForReceipt(
    origin: string,
    chainId: string,
    expectedChainId: string,
    txHash: string
  ): Promise<EthTxReceipt> {
    return retry(
      async () => {
        const current = this.getReceiptNetwork(chainId, expectedChainId);
        const response = await simpleFetch<{
          result: EthTxReceipt | null;
          error?: Error;
        }>(current.evm.rpc, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "request-source": origin,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getTransactionReceipt",
            params: [txHash],
            id: 1,
          }),
        });
        this.getReceiptNetwork(chainId, expectedChainId);
        if (response.data.error) throw response.data.error;
        if (!response.data.result) {
          throw new Error("Transaction receipt is pending");
        }
        return response.data.result;
      },
      {
        maxRetries: 50,
        waitMsAfterError: 500,
        maxWaitMsAfterError: 15000,
      }
    );
  }

  private static processTxResultNotification(notification: Notification): void {
    try {
      notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Tx succeeds",
        // TODO: Let users know the tx id?
        message: "Congratulations!",
      });
    } catch (e) {
      BackgroundTxEthereumService.processTxErrorNotification(notification, e);
    }
  }

  private static processTxErrorNotification(
    notification: Notification,
    e: Error
  ): void {
    const message = e.message;

    notification.create({
      iconRelativeUrl: "assets/logo-256.png",
      title: "Tx failed",
      message,
    });
  }
}
