import { Bech32Address, ChainIdHelper } from "@keplr-wallet/cosmos";
import { simpleFetch } from "@keplr-wallet/simple-fetch";
import { MsgHistory, ResMsgsHistory } from "../../main/token-detail/types";

export const hasNativeHistory = (chainId: string): boolean =>
  ChainIdHelper.parse(chainId).identifier === "epix_1916";

type Coin = { denom: string; amount: string };
type Message = Record<string, unknown> & { "@type": string };
export interface NativeTransaction {
  txhash: string;
  height: string;
  timestamp: string;
  code: number;
  tx: {
    body: { messages: Message[] };
    auth_info: { fee: { amount: Coin[] } };
  };
}
interface SearchResponse {
  tx_responses: NativeTransaction[];
  total: string;
}
export type HistoryFetch = (
  rest: string,
  path: string,
  signal?: AbortSignal
) => Promise<unknown>;

const fetchHistory: HistoryFetch = async (rest, path, signal) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    return (
      await simpleFetch<unknown>(rest, path, { signal: controller.signal })
    ).data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoin(value: unknown): value is Coin {
  return (
    isRecord(value) &&
    typeof value["denom"] === "string" &&
    value["denom"].length > 0 &&
    typeof value["amount"] === "string" &&
    /^\d+$/.test(value["amount"])
  );
}

function isTransaction(value: unknown): value is NativeTransaction {
  if (!isRecord(value) || !isRecord(value["tx"])) return false;
  const { body, auth_info: authInfo } = value["tx"];
  return (
    typeof value["txhash"] === "string" &&
    /^[a-fA-F0-9]{64}$/.test(value["txhash"]) &&
    typeof value["height"] === "string" &&
    /^\d+$/.test(value["height"]) &&
    Number.isSafeInteger(Number(value["height"])) &&
    typeof value["timestamp"] === "string" &&
    Number.isFinite(Date.parse(value["timestamp"])) &&
    Number.isSafeInteger(value["code"]) &&
    isRecord(body) &&
    Array.isArray(body["messages"]) &&
    body["messages"].every(
      (msg) => isRecord(msg) && typeof msg["@type"] === "string"
    ) &&
    isRecord(authInfo) &&
    isRecord(authInfo["fee"]) &&
    Array.isArray(authInfo["fee"]["amount"]) &&
    authInfo["fee"]["amount"].every(isCoin)
  );
}

function parseSearch(value: unknown): SearchResponse {
  if (
    !isRecord(value) ||
    typeof value["total"] !== "string" ||
    !/^\d+$/.test(value["total"]) ||
    !Number.isSafeInteger(Number(value["total"])) ||
    !Array.isArray(value["tx_responses"]) ||
    !value["tx_responses"].every(isTransaction)
  ) {
    throw new TypeError("Invalid transaction history response");
  }
  return { tx_responses: value["tx_responses"], total: value["total"] };
}

const stakingRelations: Record<string, string | undefined> = {
  "/cosmos.staking.v1beta1.MsgDelegate": "delegate",
  "/cosmos.staking.v1beta1.MsgUndelegate": "undelegate",
  "/cosmos.staking.v1beta1.MsgBeginRedelegate": "redelegate",
  "/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation": "cancel-undelegate",
};

type MessageDescription = { relation: string; coins?: Coin[] };

function describeSend(
  msg: Message,
  address: string
): MessageDescription | undefined {
  if (msg["from_address"] !== address && msg["to_address"] !== address) return;
  if (!Array.isArray(msg["amount"]) || !msg["amount"].every(isCoin)) {
    throw new TypeError("Invalid transfer amount");
  }
  if (msg["from_address"] === address && msg["to_address"] === address) return;
  return {
    relation: msg["from_address"] === address ? "send" : "receive",
    coins: msg["amount"],
  };
}

function describeMessage(
  msg: Message,
  address: string
): MessageDescription | undefined {
  if (msg["@type"] === "/cosmos.bank.v1beta1.MsgSend")
    return describeSend(msg, address);
  const relation = stakingRelations[msg["@type"]];
  if (relation && msg["delegator_address"] === address) {
    if (!isCoin(msg["amount"])) throw new TypeError("Invalid staking amount");
    return { relation, coins: [msg["amount"]] };
  }
  if (
    ["/cosmos.gov.v1.MsgVote", "/cosmos.gov.v1beta1.MsgVote"].includes(
      msg["@type"]
    ) &&
    msg["voter"] === address
  )
    return { relation: "vote" };
}

export function transactionMessages(
  tx: NativeTransaction,
  chainId: string,
  address: string,
  nativeDenom: string
): ResMsgsHistory["msgs"] {
  const create = (
    msg: Message,
    msgIndex: number,
    relation: string,
    denom: string
  ): { msg: MsgHistory } => ({
    msg: {
      txHash: tx.txhash.toUpperCase(),
      height: Number(tx.height),
      code: tx.code,
      time: tx.timestamp,
      chainId,
      chainIdentifier: ChainIdHelper.parse(chainId).identifier,
      relation,
      msgIndex,
      msg,
      denoms: [denom],
      eventStartIndex: 0,
      eventEndIndex: 0,
      search: address,
      meta: {},
      nativeFee: tx.tx.auth_info.fee.amount,
    },
  });
  return tx.tx.body.messages.flatMap((msg, index) => {
    const described = describeMessage(msg, address);
    if (described) {
      return (described.coins ?? [{ denom: nativeDenom, amount: "0" }]).map(
        (coin) => create(msg, index, described.relation, coin["denom"])
      );
    }
    // Keep indexed transactions visible without guessing amounts from events
    // (which also include gas fees and transfers belonging to other messages).
    return [create(msg, index, "native/transaction", nativeDenom)];
  });
}

type Stream = {
  event: string;
  nextPage: number;
  loaded: number;
  total?: number;
  pending: NativeTransaction[];
};

function isHistoryAddress(address: string): boolean {
  // The standard bech32 length limit also bounds validation of untrusted input.
  if (address.length > 90 || !/^[a-z0-9]+$/.test(address)) return false;
  try {
    Bech32Address.validate(address);
    return true;
  } catch {
    return false;
  }
}

/** Merge both descending indexes before emitting a page, including skewed streams. */
export class NativeHistoryPager {
  private streams: Stream[] = ["message.sender", "transfer.recipient"].map(
    (event) => ({ event, nextPage: 1, loaded: 0, pending: [] })
  );
  private seen = new Set<string>();
  private maxHeight?: number;

  constructor(
    private readonly rest: string,
    private readonly chainId: string,
    private readonly address: string,
    private readonly nativeDenom: string,
    private readonly fetch: HistoryFetch = fetchHistory,
    private readonly pageSize = 20
  ) {
    // Validate the checksum and restrict the prefix before query interpolation.
    if (!isHistoryAddress(address)) {
      throw new TypeError("Invalid history address");
    }
  }

  private async refill(stream: Stream, signal?: AbortSignal): Promise<void> {
    if (
      stream.pending.length ||
      (stream.total !== undefined && stream.loaded >= stream.total)
    )
      return;
    const query = `${stream.event}='${this.address}' AND tx.height<=${this.maxHeight}`;
    const params = new URLSearchParams({
      query,
      limit: String(this.pageSize),
      page: String(stream.nextPage),
      order_by: "ORDER_BY_DESC",
    });
    const response = parseSearch(
      await this.fetch(this.rest, `/cosmos/tx/v1beta1/txs?${params}`, signal)
    );
    stream.total = Number(response.total);
    if (!response.tx_responses.length && stream.loaded < stream.total) {
      throw new TypeError("Incomplete transaction history response");
    }
    stream.pending = response.tx_responses;
    stream.loaded += response.tx_responses.length;
    stream.nextPage++;
  }

  private async freezeHeight(signal?: AbortSignal): Promise<void> {
    if (this.maxHeight === undefined) {
      const latest = await this.fetch(
        this.rest,
        "/cosmos/base/tendermint/v1beta1/blocks/latest",
        signal
      );
      const block =
        isRecord(latest) && isRecord(latest["block"])
          ? latest["block"]
          : undefined;
      const height =
        block && isRecord(block["header"])
          ? block["header"]["height"]
          : undefined;
      if (
        typeof height !== "string" ||
        !/^\d+$/.test(height) ||
        !Number.isSafeInteger(Number(height))
      ) {
        throw new TypeError("Invalid transaction history snapshot");
      }
      this.maxHeight = Number(height);
    }
  }

  private async readPage(
    streams: Stream[],
    seen: Set<string>,
    remaining: number,
    signal?: AbortSignal
  ): Promise<NativeTransaction[]> {
    if (remaining === 0) return [];
    // Refill the independent indexes in parallel, then choose the newest head.
    // The following record depends on that choice, so collection is sequential.
    await Promise.all(streams.map((stream) => this.refill(stream, signal)));
    const available = streams.filter((stream) => stream.pending.length > 0);
    available.sort(
      (a, b) => Number(b.pending[0].height) - Number(a.pending[0].height)
    );
    const tx = available[0]?.pending.shift();
    if (!tx) return [];
    const hash = tx.txhash.toUpperCase();
    if (seen.has(hash)) return this.readPage(streams, seen, remaining, signal);
    seen.add(hash);
    const rest = await this.readPage(streams, seen, remaining - 1, signal);
    return [tx, ...rest];
  }

  async next(signal?: AbortSignal): Promise<ResMsgsHistory> {
    await this.freezeHeight(signal);
    // Commit cursors only after a complete page. A failed request can be retried
    // without dropping transactions already consumed from the other stream.
    const streams = this.streams.map((stream) => ({
      ...stream,
      pending: stream.pending.slice(),
    }));
    const seen = new Set(this.seen);
    const transactions = await this.readPage(
      streams,
      seen,
      this.pageSize,
      signal
    );
    const messages = transactions.flatMap((tx) =>
      transactionMessages(tx, this.chainId, this.address, this.nativeDenom)
    );
    this.streams = streams;
    this.seen = seen;
    const hasMore = streams.some(
      (stream) => stream.pending.length || stream.loaded < (stream.total ?? 0)
    );
    return { msgs: messages, nextCursor: hasMore ? "more" : "" };
  }
}
