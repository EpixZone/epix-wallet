import {
  EPIX_OSMOSIS_DENOM,
  SUPPORTED_OUTPUT_DENOMS,
  fetchJSON,
  fetchSwapQuote,
  getOsmosisFeeQuote,
  lookupTx,
  packetAck,
  readBalance,
  simulateTx,
  validateBridgeRoute,
  validateSwapQuote,
} from "./network";

const originalFetch = global.fetch;
const usdc = SUPPORTED_OUTPUT_DENOMS[0];
const request = {
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

function feeResponses(url: string): unknown {
  if (url.endsWith("cur_eip_base_fee")) return { base_fee: "0.03" };
  if (url.endsWith("base_denom")) return { base_denom: "uosmo" };
  if (url.endsWith("fee_tokens")) return { fee_tokens: [{ denom: usdc }] };
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
    (await getOsmosisFeeQuote({ ...feeRequest, feeDenom: usdc })).fee.amount
  ).toEqual([{ denom: usdc, amount: "2525" }]);
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
    getOsmosisFeeQuote({ ...feeRequest, feeDenom: usdc })
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
