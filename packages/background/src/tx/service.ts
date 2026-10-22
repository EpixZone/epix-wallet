import { ChainsService } from "../chains";
import { ChainIdHelper, TendermintTxTracer } from "@keplr-wallet/cosmos";
import { Notification } from "./types";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { Buffer } from "buffer/";
import { retry } from "@keplr-wallet/common";
import { GetTransactionReceiptResponse, RpcProvider } from "starknet";

interface CosmosSdkError {
  codespace: string;
  code: number;
  message: string;
}

interface ABCIMessageLog {
  msg_index: number;
  success: boolean;
  log: string;
  // Events StringEvents
}

export class BackgroundTxService {
  constructor(
    protected readonly chainsService: ChainsService,
    protected readonly notification: Notification
  ) {}

  async init(): Promise<void> {
    // noop
  }

  async sendTx(
    chainId: string,
    tx: unknown,
    mode: "async" | "sync" | "block",
    options: {
      silent?: boolean;
      skipTracingTxResult?: boolean;
      waitFulfillment?: boolean;
      onFulfill?: (tx: any) => void;
    }
  ): Promise<Uint8Array> {
    const modularChainInfo =
      this.chainsService.getModularChainInfoOrThrow(chainId);
    if (
      modularChainInfo.type !== "cosmos" &&
      modularChainInfo.type !== "ethermint"
    ) {
      throw new Error(`Not a cosmos chain: ${chainId}`);
    }
    const cosmosInfo = modularChainInfo.cosmos;

    if (!options.silent) {
      this.notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Tx is pending...",
        message: "Wait a second",
      });
    }

    const isProtoTx = Buffer.isBuffer(tx) || tx instanceof Uint8Array;

    const params = isProtoTx
      ? {
          tx_bytes: Buffer.from(tx as any).toString("base64"),
          mode: (() => {
            switch (mode) {
              case "async":
                return "BROADCAST_MODE_ASYNC";
              case "block":
                return "BROADCAST_MODE_BLOCK";
              case "sync":
                return "BROADCAST_MODE_SYNC";
              default:
                return "BROADCAST_MODE_UNSPECIFIED";
            }
          })(),
        }
      : {
          tx,
          mode: mode,
        };

    let submissionAttempted = false;
    let submissionRejected = false;
    let submittedHash: string | undefined;
    try {
      const body = JSON.stringify(params);
      submissionAttempted = true;
      const result = await simpleFetch<any>(
        cosmosInfo.rest,
        isProtoTx ? "/cosmos/tx/v1beta1/txs" : "/txs",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body,
        }
      );

      const txResponse = isProtoTx ? result.data["tx_response"] : result.data;

      if (txResponse.code != null && txResponse.code !== 0) {
        submissionRejected = true;
        throw new Error(txResponse["raw_log"]);
      }

      const txHash = Buffer.from(txResponse.txhash, "hex");
      if (txHash.length === 0) throw new Error("No tx hash responded");
      submittedHash = txHash.toString("hex").toUpperCase();

      if (options.skipTracingTxResult) {
        return txHash;
      }

      const fulfillment = this.waitForTx(
        chainId,
        modularChainInfo.chainId,
        txHash
      ).then((tx) => {
        this.getReceiptNetwork(chainId, modularChainInfo.chainId);
        if (options.onFulfill) {
          if (!tx.hash) tx.hash = txHash;
          options.onFulfill(tx);
        }
        if (!options.silent) {
          BackgroundTxService.processTxResultNotification(
            this.notification,
            tx
          );
        }
      });
      if (options.waitFulfillment) {
        await fulfillment;
      } else {
        fulfillment.catch((e) => {
          console.error(
            "Transaction confirmation is unavailable",
            submittedHash,
            e
          );
        });
      }

      return txHash;
    } catch (e) {
      if (submissionAttempted && !submissionRejected) {
        const unknown = new Error(
          submittedHash
            ? `Transaction ${submittedHash} was submitted but confirmation is unavailable. Check its status before sending again. ${e.message}`
            : `Transaction submission outcome is unknown. Check its status before sending again. ${e.message}`
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
      console.log(e);
      if (!options.silent) {
        BackgroundTxService.processTxErrorNotification(this.notification, e);
      }
      throw e;
    }
  }

  async traceTx(chainId: string, txHash: string): Promise<any> {
    const modularChainInfo =
      this.chainsService.getModularChainInfoOrThrow(chainId);
    if (
      modularChainInfo.type !== "cosmos" &&
      modularChainInfo.type !== "ethermint"
    ) {
      throw new Error(`Not a cosmos chain: ${chainId}`);
    }
    if (
      chainId !== modularChainInfo.chainId &&
      chainId !== ChainIdHelper.parse(modularChainInfo.chainId).identifier
    ) {
      throw new Error("The transaction's network has changed");
    }
    return this.waitForTx(
      chainId,
      modularChainInfo.chainId,
      Buffer.from(txHash, "hex")
    );
  }

  private getReceiptNetwork(chainId: string, expectedChainId: string) {
    const current = this.chainsService.getModularChainInfoOrThrow(chainId);
    if (
      current.chainId !== expectedChainId ||
      (current.type !== "cosmos" && current.type !== "ethermint")
    ) {
      throw new Error("The transaction's network has changed");
    }
    return current;
  }

  private waitForTx(
    chainId: string,
    expectedChainId: string,
    txHash: Uint8Array
  ): Promise<any> {
    return retry(() => this.traceTxAttempt(chainId, expectedChainId, txHash), {
      maxRetries: 10,
      waitMsAfterError: 10 * 1000,
      maxWaitMsAfterError: 5 * 60 * 1000,
    });
  }

  private traceTxAttempt(
    chainId: string,
    expectedChainId: string,
    txHash: Uint8Array
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const current = this.getReceiptNetwork(chainId, expectedChainId);
      const tracer = new TendermintTxTracer(current.cosmos.rpc, "/websocket");
      let settled = false;
      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error: unknown, tx?: any) => {
        if (settled) return;
        settled = true;
        if (closeTimer !== undefined) clearTimeout(closeTimer);
        try {
          tracer.close();
        } catch (closeError) {
          console.error("Failed to close transaction tracer", closeError);
        }
        if (error !== undefined) reject(error);
        else resolve(tx);
      };
      tracer.addEventListener("close", () => {
        if (settled || closeTimer !== undefined) return;
        // The tracer may close its socket just before delivering the result.
        closeTimer = setTimeout(
          () => finish(new Error("WebSocket closed")),
          500
        );
      });
      tracer.addEventListener("error", () =>
        finish(new Error("WebSocket error"))
      );
      try {
        tracer.traceTx(txHash).then(
          (tx) => {
            try {
              this.getReceiptNetwork(chainId, expectedChainId);
              finish(undefined, tx);
            } catch (error) {
              finish(error);
            }
          },
          (error) => finish(error ?? new Error("Transaction lookup failed"))
        );
      } catch (error) {
        finish(error ?? new Error("Transaction lookup failed"));
      }
    });
  }

  private static processTxResultNotification(
    notification: Notification,
    result: any
  ): void {
    try {
      if (result.mode === "commit") {
        if (result.checkTx.code !== undefined && result.checkTx.code !== 0) {
          throw new Error(result.checkTx.log);
        }
        if (
          result.deliverTx.code !== undefined &&
          result.deliverTx.code !== 0
        ) {
          throw new Error(result.deliverTx.log);
        }
      } else {
        if (result.code != null && result.code !== 0) {
          // XXX: Hack of the support of the stargate.
          const log = result.log ?? (result as any)["raw_log"];
          throw new Error(log);
        }
      }

      notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Tx succeeds",
        // TODO: Let users know the tx id?
        message: "Congratulations!",
      });
    } catch (e) {
      BackgroundTxService.processTxErrorNotification(notification, e);
    }
  }

  private static processTxErrorNotification(
    notification: Notification,
    e: Error
  ): void {
    console.log(e);
    let message = e.message;

    // Tendermint rpc error.
    const tendermintRpcErrorMessage =
      BackgroundTxService.parseTendermintRpcErrorMessage(e.message);
    if (tendermintRpcErrorMessage) {
      // If error is from tendermint
      message = tendermintRpcErrorMessage;
    }

    try {
      // Cosmos-sdk error in ante handler
      const sdkErr: CosmosSdkError = JSON.parse(e.message);
      if (sdkErr?.message) {
        message = sdkErr.message;
      }
    } catch {
      // noop
    }

    try {
      // Cosmos-sdk error in processing message
      const abciMessageLogs: ABCIMessageLog[] = JSON.parse(e.message);
      if (abciMessageLogs && abciMessageLogs.length > 0) {
        for (const abciMessageLog of abciMessageLogs) {
          if (!abciMessageLog.success) {
            const sdkErr: CosmosSdkError = JSON.parse(abciMessageLog.log);
            if (sdkErr?.message) {
              message = sdkErr.message;
              break;
            }
          }
        }
      }
    } catch {
      // noop
    }

    notification.create({
      iconRelativeUrl: "assets/logo-256.png",
      title: "Tx failed",
      message,
    });
  }

  // Keep the Tendermint RPC parsing best-effort only and avoid regex backtracking
  // on raw error strings from external nodes/libraries.
  private static parseTendermintRpcErrorMessage(
    message: string
  ): string | undefined {
    if (!message.startsWith("code:")) {
      return undefined;
    }

    const messageIndex = message.indexOf("message:");
    const dataIndex = message.indexOf("data:");

    if (messageIndex < 0 || dataIndex < 0 || messageIndex > dataIndex) {
      return undefined;
    }

    const messageBody = message.slice(messageIndex + "message:".length);
    const dataDelimiter =
      messageBody.indexOf(", data:") >= 0 ? ", data:" : ",data:";
    const dataDelimiterIndex = messageBody.indexOf(dataDelimiter);

    if (dataDelimiterIndex < 0) {
      return undefined;
    }

    const dataMessage = messageBody
      .slice(dataDelimiterIndex + dataDelimiter.length)
      .trim();
    return dataMessage.length > 0 ? dataMessage : undefined;
  }

  async waitStarknetTransaction(
    chainId: string,
    txHash: string
  ): Promise<GetTransactionReceiptResponse> {
    const modularChainInfo = this.chainsService.getModularChainInfo(chainId);
    if (!modularChainInfo) {
      throw new Error("Invalid chain id");
    }
    if (modularChainInfo.type !== "starknet") {
      throw new Error("Chain is not for starknet");
    }
    const starknet = modularChainInfo.starknet;
    const provider = new RpcProvider({
      nodeUrl: starknet.rpc,
      specVersion: "0.9.0",
    });

    this.notification.create({
      iconRelativeUrl: "assets/logo-256.png",
      title: "Tx is pending...",
      message: "Wait a second",
    });

    try {
      const res = await provider.waitForTransaction(txHash, {
        retryInterval: 1000,
      });

      this.notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Tx succeeds",
        message: "Congratulations!",
      });
      return res;
    } catch (e) {
      this.notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Tx failed",
        message: "",
      });

      throw e;
    }
  }

  async pushBitcoinTransaction(
    chainId: string,
    txHex: string
  ): Promise<string> {
    const modularChainInfo = this.chainsService.getModularChainInfo(chainId);
    if (!modularChainInfo) {
      throw new Error("Invalid chain id");
    }

    if (modularChainInfo.type !== "bitcoin") {
      throw new Error("Chain is not for bitcoin");
    }

    const indexerUrl = modularChainInfo.bitcoin.rest;

    try {
      const res = await simpleFetch<string>(`${indexerUrl}/tx`, {
        method: "POST",
        body: txHex,
        headers: {
          "Content-Type": "text/plain",
        },
      });

      if (res.status !== 200) {
        const message = res.data;
        throw new Error(message);
      }

      this.notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Tx succeeds",
        message: "Congratulations!",
      });

      return res.data;
    } catch (e) {
      this.notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Tx failed",
        message: "",
      });

      throw e;
    }
  }
}
