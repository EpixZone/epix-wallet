import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import protobuf from "protobufjs";
import { MsgSwapExactAmountIn } from "../../osmosis/poolmanager/v1beta1/tx.js";
import { SwapAmountInRoute } from "../../osmosis/poolmanager/v1beta1/swap_route.js";

const uint64Max = "18446744073709551615";

test("pool IDs retain the full uint64 range in the official wire format", () => {
  const route = { poolId: uint64Max, tokenOutDenom: "uosmo" };
  // Field 1: uint64 max as a ten-byte varint. Field 2: the denomination string.
  const expected = Buffer.from("08ffffffffffffffffff011205756f736d6f", "hex");
  assert.deepEqual(
    Buffer.from(SwapAmountInRoute.encode(route).finish()),
    expected
  );
  assert.deepEqual(SwapAmountInRoute.decode(expected), route);
});

test("swap encoding matches the official schema without rounding IDs or amounts", () => {
  // Use protobufjs reflection independently of the generated ts-proto codec.
  const root = new protobuf.Root();
  for (const source of [
    "cosmos/base/v1beta1/coin.proto",
    "osmosis/poolmanager/v1beta1/swap_route.proto",
    "osmosis/poolmanager/v1beta1/tx.proto",
  ]) {
    protobuf.parse(
      readFileSync(new URL(`../proto/${source}`, import.meta.url), "utf8"),
      root
    );
  }
  const schema = root.lookupType(
    "osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn"
  );
  const message = {
    sender: "osmo1sender",
    routes: [
      { poolId: "9007199254740993", tokenOutDenom: "uosmo" },
      { poolId: uint64Max, tokenOutDenom: "ibc/EXAMPLE" },
    ],
    tokenIn: { denom: "aepix", amount: "1000000000000000000001" },
    tokenOutMinAmount: "999999999999999999999",
  };
  const expected = schema.encode(schema.fromObject(message)).finish();
  const actual = MsgSwapExactAmountIn.encode(message).finish();
  assert.deepEqual(Buffer.from(actual), Buffer.from(expected));
  assert.deepEqual(MsgSwapExactAmountIn.decode(actual), message);
  assert.deepEqual(
    schema.toObject(schema.decode(actual), { longs: String }),
    message
  );
});
