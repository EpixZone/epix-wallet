import { TxMsgData } from "@keplr-wallet/proto-types/cosmos/base/abci/v1beta1/abci";
import { MsgSwapExactAmountInResponse } from "@keplr-wallet/proto-types/osmosis/poolmanager/v1beta1/tx";
import {
  EPIX_OSMOSIS_DENOM,
  fetchJSON,
  fetchSwapQuote,
  getOsmosisFeeQuote,
  lookupSwapResult,
  lookupTx,
  packetAck,
  readBalance,
  simulateTx,
  validateBridgeRoute,
  validateSwapQuote,
} from "./network";
import {
  OSMOSIS_ALL_BTC_DENOM,
  OSMOSIS_ALL_USDC_DENOM,
  OSMOSIS_ALL_USDT_DENOM,
  OSMOSIS_USDC_DENOM,
} from "./constants";

const originalFetch = global.fetch;
const usdc = OSMOSIS_ALL_USDC_DENOM;
const request = {
  direction: "to-osmosis" as const,
  inputDenom: EPIX_OSMOSIS_DENOM,
  amountIn: "1000000000000000000",
  outputDenom: usdc,
  slippageBps: 100,
};
const quote = {
  amount_in: { amount: request.amountIn, denom: EPIX_OSMOSIS_DENOM },
  amount_out: "163",
  route: [
    {
      in_amount: request.amountIn,
      out_amount: "163",
      pools: [
        { id: 3352, token_out_denom: "uosmo" },
        { id: "3147", token_out_denom: usdc },
      ],
    },
  ],
};
function response(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  } as Response;
}
function mockJSON(resolve: (url: string) => unknown) {
  global.fetch = jest.fn(async (url) => response(resolve(String(url))));
}

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

it("validates exact single-route quotes and floors the absolute approved minimum", () => {
  expect(validateSwapQuote(quote, request, 1000)).toEqual({
    amountOut: "163",
    minimumAmountOut: "161",
    routes: [
      { poolId: "3352", tokenOutDenom: "uosmo" },
      { poolId: "3147", tokenOutDenom: usdc },
    ],
    expiresAt: 31000,
  });
});

it.each([OSMOSIS_ALL_USDT_DENOM, OSMOSIS_ALL_USDC_DENOM])(
  "preserves exact alloyed output amounts and pool IDs for %s",
  (outputDenom) => {
    const amountOut = "9007199254740993";
    const result = validateSwapQuote(
      {
        ...quote,
        amount_out: amountOut,
        route: [
          {
            ...quote.route[0],
            out_amount: amountOut,
            pools: [
              {
                id: "18446744073709551615",
                token_out_denom: outputDenom,
              },
            ],
          },
        ],
      },
      { ...request, outputDenom }
    );
    expect(result).toMatchObject({
      amountOut,
      minimumAmountOut: "8917127262193583",
      routes: [{ poolId: "18446744073709551615", tokenOutDenom: outputDenom }],
    });
  }
);

it.each([
  OSMOSIS_USDC_DENOM,
  "allUSDT",
  OSMOSIS_ALL_USDT_DENOM.replace("osmo1em6", "osmo1other"),
  OSMOSIS_ALL_USDC_DENOM.replace("allUSDC", "allUSDT"),
])(
  "rejects an unauthorized output even when the quote matches it: %s",
  (outputDenom) => {
    expect(() =>
      validateSwapQuote(
        {
          ...quote,
          route: [
            {
              ...quote.route[0],
              pools: [{ id: 1, token_out_denom: outputDenom }],
            },
          ],
        },
        { ...request, outputDenom }
      )
    ).toThrow("Invalid swap amount or token");
  }
);

it.each([
  ["zero output", { ...quote, amount_out: "0" }],
  [
    "different input",
    { ...quote, amount_in: { amount: "2", denom: EPIX_OSMOSIS_DENOM } },
  ],
  [
    "wrong asset",
    { ...quote, amount_in: { amount: request.amountIn, denom: "uosmo" } },
  ],
  ["split route", { ...quote, route: [quote.route[0], quote.route[0]] }],
  [
    "wrong destination",
    {
      ...quote,
      route: [
        { ...quote.route[0], pools: [{ id: 1, token_out_denom: "uosmo" }] },
      ],
    },
  ],
  [
    "unsafe pool number",
    {
      ...quote,
      route: [
        {
          ...quote.route[0],
          pools: [{ id: Number.MAX_SAFE_INTEGER + 1, token_out_denom: usdc }],
        },
      ],
    },
  ],
])("rejects %s before any transaction can be prepared", (_name, data) => {
  expect(() => validateSwapQuote(data, request)).toThrow();
});

it("requests a fixed Epix input with single-route routing and rejects unknown output assets", async () => {
  mockJSON(() => quote);
  await expect(fetchSwapQuote(request)).resolves.toMatchObject({
    amountOut: "163",
  });
  const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
  expect(url.searchParams.get("singleRoute")).toBe("true");
  expect(url.searchParams.get("tokenIn")).toBe(
    request.amountIn + EPIX_OSMOSIS_DENOM
  );
  expect(() =>
    validateSwapQuote(quote, { ...request, outputDenom: "unknown" })
  ).toThrow();
});

it.each([
  OSMOSIS_ALL_BTC_DENOM,
  OSMOSIS_ALL_USDT_DENOM,
  OSMOSIS_ALL_USDC_DENOM,
  "uosmo",
])(
  "requests exact reverse routing from %s to bridgeable EPIX",
  async (inputDenom) => {
    const reverse = {
      direction: "to-epix" as const,
      inputDenom,
      amountIn: "1000000",
      outputDenom: EPIX_OSMOSIS_DENOM,
      slippageBps: 100,
    };
    const amountOut = "14213343243874240299008";
    mockJSON(() => ({
      amount_in: { amount: reverse.amountIn, denom: inputDenom },
      amount_out: amountOut,
      route: [
        {
          in_amount: reverse.amountIn,
          out_amount: amountOut,
          pools: [{ id: "3486", token_out_denom: EPIX_OSMOSIS_DENOM }],
        },
      ],
    }));
    await expect(fetchSwapQuote(reverse)).resolves.toMatchObject({
      amountOut,
      minimumAmountOut: "14071209811435497896017",
      routes: [{ poolId: "3486", tokenOutDenom: EPIX_OSMOSIS_DENOM }],
    });
    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url.searchParams.get("tokenIn")).toBe(reverse.amountIn + inputDenom);
    expect(url.searchParams.get("tokenOutDenom")).toBe(EPIX_OSMOSIS_DENOM);
    expect(url.searchParams.get("singleRoute")).toBe("true");
  }
);

it.each([
  {
    direction: "to-epix",
    inputDenom: OSMOSIS_USDC_DENOM,
    outputDenom: EPIX_OSMOSIS_DENOM,
  },
  {
    direction: "to-epix",
    inputDenom:
      "factory/osmo130tfawc7katf7jwzt2rjdranhqju929rjra3xwsrfsd85hedh3tsssy9j7/alloyed/allEPIX",
    outputDenom: EPIX_OSMOSIS_DENOM,
  },
  {
    direction: "to-epix",
    inputDenom: OSMOSIS_ALL_USDT_DENOM.replace("osmo1em6", "osmo1other"),
    outputDenom: EPIX_OSMOSIS_DENOM,
  },
  { direction: "to-epix", inputDenom: EPIX_OSMOSIS_DENOM, outputDenom: usdc },
  {
    direction: "to-osmosis",
    inputDenom: usdc,
    outputDenom: EPIX_OSMOSIS_DENOM,
  },
  { direction: "to-epix", inputDenom: "uosmo", outputDenom: usdc },
])(
  "rejects unauthorized direction/input/output before querying: %j",
  async (pair) => {
    await expect(
      fetchSwapQuote({
        ...request,
        ...pair,
        direction: pair.direction as "to-epix" | "to-osmosis",
      })
    ).rejects.toThrow("Invalid swap amount or token");
    expect(global.fetch).not.toHaveBeenCalled();
  }
);

function feeResponses(url: string): unknown {
  if (url.endsWith("cur_eip_base_fee")) return { base_fee: "0.03" };
  if (url.endsWith("base_denom")) return { base_denom: "uosmo" };
  if (url.endsWith("fee_tokens"))
    return { fee_tokens: [{ denom: OSMOSIS_USDC_DENOM }] };
  if (url.includes("spot_price_by_denom")) return { spot_price: "20" };
  throw new Error("Unexpected request");
}
const feeRequest = {
  rest: "https://lcd.example",
  gasLimit: 2_000_000,
  feeDenom: "uosmo",
  minimumBaseGasPrice: "0.025",
};

it("quotes an explicit native fee ceiling with the live base-fee buffer", async () => {
  mockJSON(feeResponses);
  const result = await getOsmosisFeeQuote(feeRequest);
  expect(result.fee).toEqual({
    gas: "2000000",
    amount: [{ denom: "uosmo", amount: "72000" }],
  });
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

it("converts alternate fees in base units with one final ceiling", async () => {
  mockJSON((url) =>
    url.endsWith("cur_eip_base_fee") ? { base_fee: "0.01" } : feeResponses(url)
  );
  expect(
    (
      await getOsmosisFeeQuote({
        ...feeRequest,
        feeDenom: OSMOSIS_USDC_DENOM,
      })
    ).fee.amount
  ).toEqual([{ denom: OSMOSIS_USDC_DENOM, amount: "2525" }]);
});

it("fails closed for rejected fee assets and invalid conversion data", async () => {
  mockJSON(feeResponses);
  await expect(
    getOsmosisFeeQuote({ ...feeRequest, feeDenom: EPIX_OSMOSIS_DENOM })
  ).rejects.toThrow("does not currently accept");
  mockJSON((url) =>
    url.includes("spot_price_by_denom")
      ? { spot_price: "0" }
      : feeResponses(url)
  );
  await expect(
    getOsmosisFeeQuote({ ...feeRequest, feeDenom: OSMOSIS_USDC_DENOM })
  ).rejects.toThrow("unavailable");
});

it("rejects a stale fee quote after a delayed request and invalid gas bounds", async () => {
  jest.useFakeTimers().setSystemTime(1000);
  mockJSON((url) => {
    jest.setSystemTime(32000);
    return feeResponses(url);
  });
  await expect(getOsmosisFeeQuote(feeRequest)).rejects.toThrow("expired");
  await expect(
    getOsmosisFeeQuote({ ...feeRequest, gasLimit: 0 })
  ).rejects.toThrow("gas limit");
});

it("validates both IBC channel ends and active opposite-chain clients", async () => {
  mockJSON((url) => {
    if (url.includes("client_status")) return { status: "Active" };
    const epix = new URL(url).origin === "https://epix.example";
    if (url.endsWith("client_state"))
      return {
        identified_client_state: {
          client_id: "07-tendermint-1",
          client_state: { chain_id: epix ? "osmosis-1" : "epix_1916-1" },
        },
      };
    return {
      channel: {
        state: "STATE_OPEN",
        ordering: "ORDER_UNORDERED",
        version: "ics20-1",
        counterparty: {
          port_id: "transfer",
          channel_id: epix ? "channel-108456" : "channel-0",
        },
      },
    };
  });
  await expect(
    validateBridgeRoute("https://epix.example", "https://osmo.example")
  ).resolves.toBeUndefined();
  expect(global.fetch).toHaveBeenCalledTimes(6);
});

it("does not approve a closed or mismatched bridge", async () => {
  mockJSON(() => ({ channel: { state: "STATE_CLOSED" } }));
  await expect(
    validateBridgeRoute("https://epix.example", "https://osmo.example")
  ).rejects.toThrow("not open");
});

it("posts only to the unsigned simulation endpoint and validates returned gas", async () => {
  mockJSON(() => ({ gas_info: { gas_used: "95508" } }));
  await expect(
    simulateTx("https://epix.example", new Uint8Array([1, 2]))
  ).resolves.toBe("95508");
  expect(global.fetch).toHaveBeenCalledWith(
    "https://epix.example/cosmos/tx/v1beta1/simulate",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ tx_bytes: "AQI=" }),
    })
  );
  mockJSON(() => ({ gas_info: { gas_used: "1e6" } }));
  await expect(
    simulateTx("https://epix.example", new Uint8Array())
  ).rejects.toThrow("Invalid simulation");
});

it("looks up an exact committed transaction and decodes legacy packet attributes", async () => {
  const hash = "A".repeat(64);
  mockJSON(() => ({
    tx_response: {
      txhash: hash,
      height: "12",
      code: 0,
      events: [
        {
          type: "send_packet",
          attributes: [
            { key: "packet_src_channel", value: "channel-0" },
            {
              key: Buffer.from("packet_data").toString("base64"),
              value: Buffer.from('{"amount":"1"}').toString("base64"),
            },
          ],
        },
      ],
    },
  }));
  await expect(lookupTx("https://epix.example", hash)).resolves.toEqual({
    code: 0,
    events: [
      {
        type: "send_packet",
        attributes: [
          { key: "packet_src_channel", value: "channel-0" },
          { key: "packet_data", value: '{"amount":"1"}' },
        ],
      },
    ],
  });
  await expect(
    lookupTx("https://epix.example", "B".repeat(64))
  ).rejects.toThrow("Invalid transaction status");
});

it("treats missing transaction or ack as unresolved, never failed or delivered", async () => {
  global.fetch = jest.fn(async () => response({}, 404));
  await expect(
    lookupTx("https://epix.example", "A".repeat(64))
  ).resolves.toBeUndefined();
  await expect(packetAck("https://osmo.example", "123")).resolves.toBe(
    "pending"
  );
  mockJSON(() => ({ acknowledgement: "other acknowledgement commitment" }));
  await expect(packetAck("https://osmo.example", "123")).resolves.toBe(
    "unknown"
  );
  mockJSON(() => ({
    acknowledgement: "CPdVftUYJv4Y2EUSvyTsdQAe268hI6R333KgqfNkCnw=",
  }));
  await expect(packetAck("https://osmo.example", "123")).resolves.toBe(
    "received"
  );
});

const swapHash = "A".repeat(64);
const swapType = "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn";
const swapResponseType = `${swapType}Response`;
const expectedSwap = {
  sender: "osmo1rfxncp207da22dtdw8l7lhlvs8rtp07wsq9gtp",
  inputDenom: OSMOSIS_ALL_USDT_DENOM,
  amountIn: "1000000",
  minimumAmountOut: "9007199254740993",
  outputDenom: EPIX_OSMOSIS_DENOM,
};
function swapResponse(amount = "9007199254740994") {
  return {
    typeUrl: swapResponseType,
    value: MsgSwapExactAmountInResponse.encode({
      tokenOutAmount: amount,
    }).finish(),
  };
}
function swapData(
  msgResponses = [swapResponse()],
  data: TxMsgData["data"] = []
) {
  return Buffer.from(
    TxMsgData.encode({ data, msgResponses }).finish()
  ).toString("hex");
}
function committedSwap() {
  return {
    tx: {
      body: {
        messages: [
          {
            "@type": swapType,
            sender: expectedSwap.sender,
            token_in: {
              denom: expectedSwap.inputDenom,
              amount: expectedSwap.amountIn,
            },
            token_out_min_amount: expectedSwap.minimumAmountOut,
            routes: [
              { pool_id: "3486", token_out_denom: expectedSwap.outputDenom },
            ],
          },
        ],
      },
    },
    tx_response: {
      txhash: swapHash,
      height: "71736666",
      code: 0,
      data: swapData(),
    },
  };
}

it("reads the exact committed swap output without losing integer precision", async () => {
  mockJSON(() => committedSwap());
  await expect(
    lookupSwapResult(
      "https://osmo.example",
      swapHash.toLowerCase(),
      expectedSwap
    )
  ).resolves.toEqual({ code: 0, amountOut: "9007199254740994" });
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
    `https://osmo.example/cosmos/tx/v1beta1/txs/${swapHash.toLowerCase()}`
  );
});

it("decodes a recorded public Osmosis modern TxMsgData response", async () => {
  // Public transaction 5647D98D2F327617AD0FCA42874CA01D64E1E0491A38D00ABBC2A94358257ED0,
  // height 71736666. This is the chain-returned data, not generated by this test.
  const fixture = committedSwap();
  fixture.tx_response.data =
    "12470A392F6F736D6F7369732E706F6F6C6D616E616765722E763162657461312E4D7367537761704578616374416D6F756E74496E526573706F6E7365120A0A083138363631363436";
  fixture.tx.body.messages[0].token_out_min_amount = "18549769";
  mockJSON(() => fixture);
  await expect(
    lookupSwapResult("https://osmo.example", swapHash, {
      ...expectedSwap,
      minimumAmountOut: "18549769",
    })
  ).resolves.toEqual({ code: 0, amountOut: "18661646" });
});

it.each([
  ["hash", { txhash: "B".repeat(64) }],
  ["uncommitted height", { height: "0" }],
  ["height overflow", { height: "18446744073709551616" }],
  ["negative code", { code: -1 }],
  ["noninteger code", { code: 0.5 }],
  ["code overflow", { code: 4294967296 }],
])("rejects invalid committed swap %s", async (_name, changes) => {
  const fixture = committedSwap();
  Object.assign(fixture.tx_response, changes);
  mockJSON(() => fixture);
  await expect(
    lookupSwapResult("https://osmo.example", swapHash, expectedSwap)
  ).rejects.toThrow("Invalid transaction status");
});

it.each([
  ["message type", { "@type": "/cosmos.bank.v1beta1.MsgSend" }],
  ["sender", { sender: "another-sender" }],
  [
    "input amount",
    { token_in: { denom: expectedSwap.inputDenom, amount: "999999" } },
  ],
  [
    "input denomination",
    { token_in: { denom: "uosmo", amount: expectedSwap.amountIn } },
  ],
  ["approved minimum", { token_out_min_amount: "1" }],
  [
    "final denomination",
    { routes: [{ pool_id: "3486", token_out_denom: "uosmo" }] },
  ],
  [
    "pool id",
    { routes: [{ pool_id: "0", token_out_denom: expectedSwap.outputDenom }] },
  ],
  [
    "pool overflow",
    {
      routes: [
        {
          pool_id: "18446744073709551616",
          token_out_denom: expectedSwap.outputDenom,
        },
      ],
    },
  ],
  ["empty route", { routes: [] }],
])("rejects a swap with a different %s", async (_name, changes) => {
  const fixture = committedSwap();
  Object.assign(fixture.tx.body.messages[0], changes);
  mockJSON(() => fixture);
  await expect(
    lookupSwapResult("https://osmo.example", swapHash, expectedSwap)
  ).rejects.toThrow("Committed swap does not match");
});

it("rejects multiple transaction messages instead of attributing another response", async () => {
  const fixture = committedSwap();
  fixture.tx.body.messages.push(fixture.tx.body.messages[0]);
  mockJSON(() => fixture);
  await expect(
    lookupSwapResult("https://osmo.example", swapHash, expectedSwap)
  ).rejects.toThrow("exactly one committed swap message");
});

it.each([
  ["nonhex data", "not hex"],
  ["odd hex data", "123"],
  ["truncated protobuf", "12ff"],
  [
    "legacy response",
    swapData([], [{ msgType: swapType, data: swapResponse().value }]),
  ],
  [
    "legacy and modern responses",
    swapData(
      [swapResponse()],
      [{ msgType: swapType, data: swapResponse().value }]
    ),
  ],
  ["multiple responses", swapData([swapResponse(), swapResponse()])],
  [
    "wrong response type",
    swapData([
      { ...swapResponse(), typeUrl: "/cosmos.bank.v1beta1.MsgSendResponse" },
    ]),
  ],
  ["zero output", swapData([swapResponse("0")])],
  [
    "less than the approved minimum",
    swapData([swapResponse("9007199254740992")]),
  ],
  [
    "overflow output",
    swapData([swapResponse((BigInt(1) << BigInt(256)).toString())]),
  ],
])("rejects invalid exact swap result: %s", async (_name, data) => {
  const fixture = committedSwap();
  fixture.tx_response.data = data;
  mockJSON(() => fixture);
  await expect(
    lookupSwapResult("https://osmo.example", swapHash, expectedSwap)
  ).rejects.toThrow();
});

it("reports a failed committed swap without requiring success response data", async () => {
  const fixture = committedSwap();
  fixture.tx_response.code = 5;
  fixture.tx_response.data = "";
  mockJSON(() => fixture);
  await expect(
    lookupSwapResult("https://osmo.example", swapHash, expectedSwap)
  ).resolves.toEqual({ code: 5 });
  global.fetch = jest.fn(async () => response({}, 404));
  await expect(
    lookupSwapResult("https://osmo.example", swapHash, expectedSwap)
  ).resolves.toBeUndefined();
});

it.each([
  ["to-osmosis" as const, "channel-108456"],
  ["to-epix" as const, "channel-0"],
])(
  "checks only the destination channel acknowledgement for %s",
  async (direction, channel) => {
    mockJSON(() => ({
      acknowledgement: "CPdVftUYJv4Y2EUSvyTsdQAe268hI6R333KgqfNkCnw=",
    }));
    await expect(
      packetAck("https://destination.example", "306", undefined, direction)
    ).resolves.toBe("received");
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      `https://destination.example/ibc/core/channel/v1/channels/${channel}/ports/transfer/packet_acks/306`
    );
  }
);

it("reads exact integer balances and treats only explicit absent balances as zero", async () => {
  mockJSON(() => ({
    balance: { denom: "aepix", amount: "1000000000000000000000" },
  }));
  await expect(
    readBalance("https://epix.example", "epix-address", "aepix")
  ).resolves.toBe("1000000000000000000000");
  mockJSON(() => ({ balance: null }));
  await expect(
    readBalance("https://epix.example", "epix-address", "aepix")
  ).resolves.toBe("0");
  mockJSON(() => ({}));
  await expect(
    readBalance("https://epix.example", "epix-address", "aepix")
  ).rejects.toThrow("unavailable");
});

it("bounds a stalled request and clears its timeout after cancellation", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        );
      })
  );
  const result = fetchJSON("https://epix.example", "/read-only");
  const expectation = expect(result).rejects.toThrow("aborted");
  jest.advanceTimersByTime(10_000);
  await expectation;
  expect(jest.getTimerCount()).toBe(0);
});
