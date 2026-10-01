import { CoinPretty } from "@keplr-wallet/unit";
import {
  HistoryFetch,
  NativeHistoryPager,
  NativeTransaction,
  transactionMessages,
} from "./query";

const address = "epix1vn7qz3c3htxngjnjnrktlhyvhvks6tqsrdnz7v";
const other = "epix1zp0559wwvw5aa6mncan9gu7x7gcl7mxlkvdew6";
const chainId = "epix_1916-1";
const amount = "1000000000000000000000";
const coin = { denom: "aepix", amount };
const send = (from = other, to = address) => ({
  "@type": "/cosmos.bank.v1beta1.MsgSend",
  from_address: from,
  to_address: to,
  amount: [coin],
});
const tx = (
  height: number,
  msg = send(),
  suffix = height
): NativeTransaction => ({
  txhash: suffix.toString(16).padStart(64, "0"),
  height: String(height),
  timestamp: "2026-10-01T18:04:34Z",
  code: 0,
  tx: {
    body: { messages: [msg] },
    auth_info: {
      fee: { amount: [{ denom: "aepix", amount: "3235125000000000" }] },
    },
  },
});

function source(
  sender: NativeTransaction[],
  recipient: NativeTransaction[],
  height = 100
) {
  const paths: string[] = [];
  const fetch: HistoryFetch = jest.fn(async (_rest, path) => {
    paths.push(path);
    if (path.endsWith("/blocks/latest"))
      return { block: { header: { height: String(height) } } };
    const params = new URL(`https://api.epix.zone${path}`).searchParams;
    const query = params.get("query") ?? "";
    const snapshot = Number(query.match(/tx.height<=(\d+)/)?.[1]);
    if (!Number.isFinite(snapshot)) throw new Error("Missing snapshot bound");
    const records = (
      query.startsWith("message.sender") ? sender : recipient
    ).filter((record) => Number(record.height) <= snapshot);
    const page = Number(params.get("page"));
    const limit = Number(params.get("limit"));
    if (page > 1 && (page - 1) * limit >= records.length)
      throw new Error("Out-of-range page");
    return {
      total: String(records.length),
      pagination: null,
      tx_responses: records.slice((page - 1) * limit, page * limit),
    };
  });
  return { fetch, paths };
}
const pager = (fetch: HistoryFetch, size = 2) =>
  new NativeHistoryPager(
    "https://api.epix.zone",
    chainId,
    address,
    "aepix",
    fetch,
    size
  );

describe("native Epix history", () => {
  it("keeps incoming bank amounts and fees exact, independent of fee transfer events", () => {
    const incoming = tx(1);
    const result = transactionMessages(incoming, chainId, address, "aepix");
    expect(result).toHaveLength(1);
    expect(result[0].msg).toMatchObject({
      relation: "receive",
      chainId,
      chainIdentifier: "epix_1916",
      denoms: ["aepix"],
      nativeFee: incoming.tx.auth_info.fee.amount,
    });
    expect(
      (result[0].msg.msg as ReturnType<typeof send>).amount[0].amount
    ).toBe(amount);
    expect(
      new CoinPretty(
        { coinDenom: "EPIX", coinMinimalDenom: "aepix", coinDecimals: 18 },
        amount
      )
        .trim(true)
        .toString()
    ).toBe("1,000 EPIX");
  });

  it("identifies outgoing transfers and retains failed transaction status", () => {
    const outgoing = tx(2, send(address, other));
    outgoing.code = 5;
    expect(
      transactionMessages(outgoing, chainId, address, "aepix")[0].msg
    ).toMatchObject({ relation: "send", code: 5 });
  });

  it("does not invent a received amount for self-transfers or unknown messages", () => {
    expect(
      transactionMessages(
        tx(3, send(address, address)),
        chainId,
        address,
        "aepix"
      )[0].msg.relation
    ).toBe("native/transaction");
    const unknown = tx(4);
    unknown.tx.body.messages = [
      { "@type": "/custom.MsgAction", sender: address },
    ];
    expect(
      transactionMessages(unknown, chainId, address, "aepix")[0].msg.relation
    ).toBe("native/transaction");
  });

  it("maps native staking messages for the current account", () => {
    const staking = tx(4);
    staking.tx.body.messages = [
      {
        "@type": "/cosmos.staking.v1beta1.MsgDelegate",
        delegator_address: address,
        validator_address: "epixvaloper1example",
        amount: coin,
      },
    ];
    expect(
      transactionMessages(staking, chainId, address, "aepix")[0].msg.relation
    ).toBe("delegate");
  });

  it("retains reward claims and every message in a mixed transaction", () => {
    const mixed = tx(4);
    mixed.tx.body.messages.push({
      "@type": "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
      delegator_address: address,
      validator_address: "epixvaloper1example",
    });
    const messages = transactionMessages(mixed, chainId, address, "aepix");
    expect(messages.map(({ msg }) => [msg.msgIndex, msg.relation])).toEqual([
      [0, "receive"],
      [1, "native/transaction"],
    ]);
    expect(messages[1].msg.msg).toMatchObject({
      "@type": "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
    });
    expect(messages[1].msg.meta).toEqual({});
  });

  it("preserves separate denominations without converting amounts to Number", () => {
    const multi = tx(5);
    (multi.tx.body.messages[0]["amount"] as (typeof coin)[]).push({
      denom: "uother",
      amount: "900719925474099312345",
    });
    const result = transactionMessages(multi, chainId, address, "aepix");
    expect(result.map(({ msg }) => msg.denoms)).toEqual([
      ["aepix"],
      ["uother"],
    ]);
  });

  it("merges skewed streams globally across pages and stops at totals", async () => {
    const { fetch, paths } = source(
      [tx(90), tx(80), tx(70), tx(60)],
      [tx(10), tx(9)]
    );
    const query = pager(fetch);
    const pages = [await query.next(), await query.next(), await query.next()];
    expect(
      pages.flatMap((page) => page.msgs.map(({ msg }) => msg.height))
    ).toEqual([90, 80, 70, 60, 10, 9]);
    expect(pages.map((page) => page.nextCursor)).toEqual(["more", "more", ""]);
    const calls = paths.length;
    expect((await query.next()).msgs).toEqual([]);
    expect(paths).toHaveLength(calls);
  });

  it("deduplicates self-transfers returned by both indexes", async () => {
    const self = tx(10, send(address, address));
    const { fetch } = source([self], [self]);
    const query = pager(fetch);
    const result = await query.next();
    expect(result.msgs).toHaveLength(1);
    expect(result.nextCursor).toBe("");
  });

  it("freezes height before page one, excluding transactions arriving during pagination", async () => {
    const sender = [tx(20), tx(19), tx(18)];
    const { fetch, paths } = source(sender, [], 20);
    const query = pager(fetch, 1);
    expect((await query.next()).msgs[0].msg.height).toBe(20);
    sender.unshift(tx(21));
    expect((await query.next()).msgs[0].msg.height).toBe(19);
    expect(paths[0]).toMatch(/\/blocks\/latest$/);
    expect(
      paths
        .slice(1)
        .every((path) =>
          new URL(`https://api.epix.zone${path}`).searchParams
            .get("query")
            ?.endsWith(" AND tx.height<=20")
        )
    ).toBe(true);
  });

  it("retries a failed page without losing consumed records", async () => {
    const base = source([tx(10), tx(9)], [tx(1)]);
    let fail = true;
    const fetch: HistoryFetch = async (rest, path, signal) => {
      if (path.includes("transfer.recipient") && fail) {
        fail = false;
        throw new Error("Offline");
      }
      return base.fetch(rest, path, signal);
    };
    const query = pager(fetch);
    await expect(query.next()).rejects.toThrow("Offline");
    expect((await query.next()).msgs.map(({ msg }) => msg.height)).toEqual([
      10, 9,
    ]);
    expect((await query.next()).msgs.map(({ msg }) => msg.height)).toEqual([1]);
  });

  it("reports malformed responses instead of claiming no transactions", async () => {
    const base = source([], []);
    const fetch: HistoryFetch = (rest, path, signal) =>
      path.endsWith("/blocks/latest")
        ? base.fetch(rest, path, signal)
        : Promise.resolve({ total: "1", tx_responses: [] });
    await expect(pager(fetch).next()).rejects.toThrow(
      "Incomplete transaction history response"
    );
  });

  it("rejects malformed amount values instead of rounding or displaying NaN", async () => {
    const bad = tx(4);
    bad.tx.body.messages[0]["amount"] = [{ denom: "aepix", amount: "1e21" }];
    const { fetch } = source([], [bad]);
    await expect(pager(fetch).next()).rejects.toThrow(
      "Invalid transfer amount"
    );
  });

  it("does not interpolate arbitrary query syntax from an account address", () => {
    expect(
      () =>
        new NativeHistoryPager(
          "https://api.epix.zone",
          chainId,
          "x' OR tx.height>1",
          "aepix"
        )
    ).toThrow("Invalid history address");
  });
});
