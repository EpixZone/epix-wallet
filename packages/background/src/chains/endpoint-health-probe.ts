export type EndpointCapability = "rpc" | "rest" | "evmRpc";

export interface EndpointCapabilityHealth {
  readonly endpoint: string;
  readonly status:
    | "unknown"
    | "healthy"
    | "stale"
    | "unavailable"
    | "wrong-chain"
    | "syncing"
    | "malformed";
  readonly checkedAt?: number;
  readonly height?: string;
  readonly blockTime?: number;
  readonly detail?: string;
}

export const ENDPOINT_PROBE_TIMEOUT = 5_000;
export const ENDPOINT_RECEIPT_TTL = 30_000;
const STATUS_BYTES = 1024 * 1024;
const BLOCK_BYTES = 8 * 1024 * 1024;
const MAX_BLOCK_AGE = 120_000;
const MAX_FUTURE_TIME = 30_000;

class ProbeError extends Error {
  constructor(
    readonly status: EndpointCapabilityHealth["status"],
    message: string
  ) {
    super(message);
  }
}

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProbeError("malformed", "Expected a JSON object");
  }
  return value as ObjectValue;
}
function positiveHeight(value: unknown, hex = false): string {
  if (
    typeof value !== "string" ||
    !(hex ? /^0x[0-9a-f]+$/i : /^[0-9]+$/).test(value) ||
    value.length > 80 ||
    BigInt(value) <= BigInt(0)
  ) {
    throw new ProbeError("malformed", "Invalid block height");
  }
  return BigInt(value).toString();
}
function blockTime(value: unknown, now: number, hex = false): number {
  let time: number;
  if (hex) {
    positiveHeight(value, true);
    const seconds = BigInt(value as string);
    if (seconds > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1000))) {
      // Date's valid range is much smaller than an arbitrary uint256.
      throw new ProbeError("malformed", "Invalid block timestamp");
    }
    time = Number(seconds) * 1000;
  } else {
    time = typeof value === "string" ? Date.parse(value) : NaN;
  }
  if (!Number.isFinite(time) || time <= 0) {
    throw new ProbeError("malformed", "Invalid block timestamp");
  }
  if (time > now + MAX_FUTURE_TIME) {
    throw new ProbeError("stale", "Block time is in the future");
  }
  if (now - time > MAX_BLOCK_AGE) {
    throw new ProbeError("stale", "Latest block is too old");
  }
  return time;
}
function network(actual: unknown, expected: string): void {
  if (typeof actual !== "string") {
    throw new ProbeError("malformed", "Missing network identity");
  }
  if (actual !== expected) {
    throw new ProbeError("wrong-chain", "Network identity does not match");
  }
}

export function endpointRequestURL(base: string, path: string): string {
  const url = new URL(base);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new ProbeError("malformed", "Unsupported endpoint URL");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") + path;
  return url.toString();
}

async function readJSON(response: Response, limit: number): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProbeError("unavailable", `HTTP ${response.status}`);
  }
  if (response.redirected) {
    await response.body?.cancel();
    throw new ProbeError("unavailable", "Redirected health response");
  }
  const length = response.headers.get("content-length");
  if (length && Number(length) > limit) {
    await response.body?.cancel();
    throw new ProbeError("malformed", "Health response exceeds the size limit");
  }
  if (!response.body) {
    throw new ProbeError("malformed", "Empty health response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ProbeError(
          "malformed",
          "Health response exceeds the size limit"
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ProbeError("malformed", "Invalid health JSON");
  }
}

export interface EndpointProbeOptions {
  readonly chainId: string;
  readonly evmChainId?: string;
  readonly capability: EndpointCapability;
  readonly endpoint: string;
  readonly fetch: typeof fetch;
  readonly now: () => number;
  readonly signal: AbortSignal;
}

export async function probeEndpoint(
  options: EndpointProbeOptions
): Promise<EndpointCapabilityHealth> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  let rejectDeadline: (error: Error) => void = () => undefined;
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  const interrupted = () =>
    rejectDeadline(new ProbeError("unavailable", "Health check cancelled"));
  controller.signal.addEventListener("abort", interrupted, { once: true });
  const timer = setTimeout(() => {
    rejectDeadline(new ProbeError("unavailable", "Health check timed out"));
    controller.abort();
  }, ENDPOINT_PROBE_TIMEOUT);
  const json = async (path: string, body?: unknown, limit = STATUS_BYTES) => {
    if (controller.signal.aborted) {
      throw new ProbeError("unavailable", "Health check cancelled");
    }
    const response = await options.fetch(
      endpointRequestURL(options.endpoint, path),
      {
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        cache: "no-store",
      }
    );
    return readJSON(response, limit);
  };
  const run = async (): Promise<
    Pick<EndpointCapabilityHealth, "height" | "blockTime">
  > => {
    if (options.capability === "rpc") {
      const response = object(await json("/status"));
      if (response["error"])
        throw new ProbeError("unavailable", "RPC status error");
      const result = object(response["result"] ?? response);
      network(object(result["node_info"])["network"], options.chainId);
      const sync = object(result["sync_info"]);
      if (sync["catching_up"] === true)
        throw new ProbeError("syncing", "RPC is catching up");
      if (sync["catching_up"] !== false)
        throw new ProbeError("malformed", "Missing RPC sync state");
      return {
        height: positiveHeight(sync["latest_block_height"]),
        blockTime: blockTime(sync["latest_block_time"], options.now()),
      };
    }
    if (options.capability === "rest") {
      const info = object(
        await json("/cosmos/base/tendermint/v1beta1/node_info")
      );
      network(object(info["default_node_info"])["network"], options.chainId);
      const latest = object(
        await json(
          "/cosmos/base/tendermint/v1beta1/blocks/latest",
          undefined,
          BLOCK_BYTES
        )
      );
      const header = object(
        object(latest["sdk_block"] ?? latest["block"])["header"]
      );
      network(header["chain_id"], options.chainId);
      return {
        height: positiveHeight(header["height"]),
        blockTime: blockTime(header["time"], options.now()),
      };
    }
    if (!options.evmChainId)
      throw new ProbeError("wrong-chain", "No reviewed EVM identity");
    let id = 0;
    const rpc = async (method: string, params: unknown[]) => {
      const requestId = ++id;
      const value = object(
        await json("", { jsonrpc: "2.0", id: requestId, method, params })
      );
      if (
        value["jsonrpc"] !== "2.0" ||
        value["id"] !== requestId ||
        value["error"] !== undefined ||
        !("result" in value)
      ) {
        throw new ProbeError("malformed", "Invalid JSON-RPC result");
      }
      return value["result"];
    };
    const idResult = await rpc("eth_chainId", []);
    if (typeof idResult !== "string" || !/^0x[0-9a-f]{1,64}$/i.test(idResult)) {
      throw new ProbeError("malformed", "Invalid EVM chain identity");
    }
    if (BigInt(idResult) !== BigInt(options.evmChainId))
      throw new ProbeError(
        "wrong-chain",
        "EVM network identity does not match"
      );
    const syncing = await rpc("eth_syncing", []);
    if (syncing !== false) {
      throw new ProbeError(
        syncing && typeof syncing === "object" ? "syncing" : "malformed",
        "EVM is not ready"
      );
    }
    const block = object(await rpc("eth_getBlockByNumber", ["latest", false]));
    return {
      height: positiveHeight(block["number"], true),
      blockTime: blockTime(block["timestamp"], options.now(), true),
    };
  };
  try {
    const result = await Promise.race([run(), deadline]);
    return Object.freeze({
      endpoint: options.endpoint,
      status: "healthy",
      checkedAt: options.now(),
      ...result,
    });
  } catch (error) {
    return Object.freeze({
      endpoint: options.endpoint,
      status: error instanceof ProbeError ? error.status : "unavailable",
      checkedAt: options.now(),
      detail:
        error instanceof ProbeError ? error.message : "Endpoint request failed",
    });
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", interrupted);
  }
}

// Sequential status calls naturally differ by several blocks. Only reject a
// large discrepancy accompanied by an older block time on the lagging side.
// This compares two exact-chain receipts, not hashes or independent trust votes.
export function checkCosmosProfileLag(
  rpc: EndpointCapabilityHealth,
  rest: EndpointCapabilityHealth
): readonly [EndpointCapabilityHealth, EndpointCapabilityHealth] {
  if (
    rpc.status !== "healthy" ||
    rest.status !== "healthy" ||
    !rpc.height ||
    !rest.height ||
    rpc.blockTime === undefined ||
    rest.blockTime === undefined
  )
    return [rpc, rest];
  const r = BigInt(rpc.height);
  const s = BigInt(rest.height);
  const stale = (value: EndpointCapabilityHealth): EndpointCapabilityHealth =>
    Object.freeze({
      ...value,
      status: "stale",
      detail:
        "Service is over 20 blocks and 30 seconds behind its matching Cosmos service",
    });
  if (r - s > BigInt(20) && rpc.blockTime - rest.blockTime > 30_000)
    return [rpc, stale(rest)];
  if (s - r > BigInt(20) && rest.blockTime - rpc.blockTime > 30_000)
    return [stale(rpc), rest];
  return [rpc, rest];
}
