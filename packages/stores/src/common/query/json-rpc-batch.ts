import { ObservableQuery, QueryOptions } from "./query";
import { QuerySharedContext } from "./context";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { JsonRpcResponse } from "@keplr-wallet/types";
import { Hash } from "@keplr-wallet/crypto";
import { Buffer } from "buffer/";
import { makeObservable, observable, runInAction } from "mobx";

export interface JsonRpcBatchRequest {
  method: string;
  params: unknown;
  id: string;
}

export interface JsonRpcBatchRequestError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Observable query for batched JSON-RPC requests.
 * Manages an array of `JsonRpcBatchRequest` and returns a map of results keyed by request ID.
 * Per-request errors (when the batch HTTP call succeeds but individual calls fail)
 * are surfaced via `perRequestErrors`.
 */
export class ObservableJsonRpcBatchQuery<T = unknown> extends ObservableQuery<
  Record<string, T>
> {
  @observable.ref
  protected _perRequestErrors: Record<string, JsonRpcBatchRequestError> = {};

  constructor(
    sharedContext: QuerySharedContext,
    baseURL: string,
    url: string,
    protected readonly requests: JsonRpcBatchRequest[],
    options: Partial<QueryOptions> = {}
  ) {
    super(sharedContext, baseURL, url, options);
    makeObservable(this);
  }

  get perRequestErrors(): Readonly<Record<string, JsonRpcBatchRequestError>> {
    return this._perRequestErrors;
  }

  protected override getCacheKey(): string {
    const requestsHash = Buffer.from(
      Hash.sha256(
        Buffer.from(
          JSON.stringify(this.requests, (_, value) => {
            if (typeof value === "bigint") {
              return value.toString();
            }
            return value;
          })
        )
      ).slice(0, 8)
    ).toString("hex");

    return `${super.getCacheKey()}-${requestsHash}`;
  }

  protected override async fetchResponse(
    abortController: AbortController
  ): Promise<{ headers: any; data: Record<string, T> }> {
    // Clear prior per-request errors so a retry/HTTP failure doesn't leak
    // stale errors from a previous successful fetch.
    runInAction(() => {
      this._perRequestErrors = {};
    });

    const batchBody = this.requests.map((req) => ({
      jsonrpc: "2.0",
      method: req.method,
      params: req.params,
      id: req.id,
    }));

    const response = await simpleFetch<JsonRpcResponse<T>[]>(
      this.baseURL,
      this.url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(batchBody, (_, value) => {
          if (typeof value === "bigint") {
            return value.toString();
          }
          return value;
        }),
        signal: abortController.signal,
      }
    );

    if (!response.data || !Array.isArray(response.data)) {
      throw new Error("Invalid batch response");
    }

    const data: Record<string, T> = {};
    const perRequestErrors: Record<string, JsonRpcBatchRequestError> = {};
    const responded = new Set<string>();

    for (const res of response.data) {
      const id = String(res.id);
      responded.add(id);
      if (res.error) {
        perRequestErrors[id] = res.error;
        continue;
      }

      data[id] = res.result as T;
    }

    // Servers may silently omit IDs on partial failures — synthesize an error
    // so callers can't sit in permanent loading on a missing response.
    for (const req of this.requests) {
      const id = String(req.id);
      if (!responded.has(id)) {
        perRequestErrors[id] = {
          code: -32603,
          message: `No response for request id ${id}`,
        };
      }
    }

    runInAction(() => {
      this._perRequestErrors = perRequestErrors;
    });

    return {
      headers: response.headers,
      data,
    };
  }
}
