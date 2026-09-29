const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { createServer } = require("node:http");
const test = require("node:test");

const relayRequire = createRequire(
  require.resolve("@walletconnect/relay-auth")
);
const ed25519 = relayRequire("@stablelib/ed25519");
const relayAuth = require("@walletconnect/relay-auth");
const queryString = require("query-string");
const axios = require("axios");
const bs58check = require("bs58check");
const protobuf = require("protobufjs");
const Long = require("long");

test("query-string can call the patched URI decoder from CommonJS", () => {
  assert.deepEqual(
    { ...queryString.parse("message=hello%20world&currency=%E2%82%AC") },
    { message: "hello world", currency: "€" }
  );
  // Malformed percent-encoded UTF-8 exercises the patched fallback decoder.
  assert.equal(queryString.parse("message=%E2%82").message, "%E2%82");
});

test("Base58Check preserves a known Bitcoin address and rejects a bad checksum", () => {
  const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  const payload = Buffer.from(
    "0062e907b15cbf27d5425399ebf6f0fb50ebb88f18",
    "hex"
  );
  assert.deepEqual(bs58check.decode(address), payload);
  assert.equal(bs58check.encode(payload), address);
  assert.throws(() => bs58check.decode(address.slice(0, -1) + "b"));

  const bs58 = createRequire(require.resolve("bs58check"))("bs58");
  assert.equal(bs58.encode(Buffer.from([0, 0, 1])), "112");
  assert.deepEqual(Buffer.from(bs58.decode("112")), Buffer.from([0, 0, 1]));
  assert.throws(() => bs58.decode("0OIl"));
});

test("protobuf encodes Long 4 values without truncating uint64 amounts", () => {
  const Transfer = protobuf
    .parse(
      'syntax = "proto3"; message Transfer { uint64 amount = 1; bytes address = 2; }'
    )
    .root.lookupType("Transfer");
  const value = {
    amount: Long.fromString("18446744073709551615", true),
    address: Buffer.from([0, 1, 255]),
  };
  const encoded = Transfer.encode(value).finish();
  assert.equal(
    Buffer.from(encoded).toString("hex"),
    "08ffffffffffffffffff0112030001ff"
  );
  const decoded = Transfer.decode(encoded);
  assert.equal(decoded.amount.toString(), "18446744073709551615");
  assert.deepEqual(Buffer.from(decoded.address), value.address);
});

test("Axios retains JSON error responses and CancelToken behavior", async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "unauthorized" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const client = axios.create({
    baseURL: `http://127.0.0.1:${server.address().port}`,
    proxy: false,
  });
  await assert.rejects(client.get("/error"), (error) => {
    assert.equal(axios.isAxiosError(error), true);
    assert.equal(error.response.status, 401);
    assert.deepEqual(error.response.data, { error: "unauthorized" });
    return true;
  });

  const source = axios.CancelToken.source();
  const pending = client.get("/cancel", { cancelToken: source.token });
  source.cancel("cancelled by wallet");
  await assert.rejects(pending, (error) => {
    assert.equal(axios.isCancel(error), true);
    assert.equal(error.message, "cancelled by wallet");
    return true;
  });
});

// Adding the Ed25519 group order to S preserves the mathematical signature,
// but RFC 8032 requires verifiers to reject this non-canonical encoding.
function addGroupOrder(signature) {
  const order = Buffer.from(
    "edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010",
    "hex"
  );
  const changed = Uint8Array.from(signature);
  let carry = 0;
  for (let i = 0; i < order.length; i++) {
    const sum = changed[32 + i] + order[i] + carry;
    changed[32 + i] = sum & 0xff;
    carry = sum >>> 8;
  }
  assert.equal(carry, 0);
  return changed;
}

test("relay Ed25519 verifies the RFC 8032 vector and rejects S + L", () => {
  const seed = Buffer.from(
    "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    "hex"
  );
  const expectedPublicKey =
    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
  const expectedSignature =
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
    "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";
  const keyPair = ed25519.generateKeyPairFromSeed(seed);
  const message = new Uint8Array();
  const signature = ed25519.sign(keyPair.secretKey, message);

  assert.equal(
    Buffer.from(keyPair.publicKey).toString("hex"),
    expectedPublicKey
  );
  assert.equal(Buffer.from(signature).toString("hex"), expectedSignature);
  assert.equal(ed25519.verify(keyPair.publicKey, message, signature), true);
  assert.equal(
    ed25519.verify(keyPair.publicKey, message, addGroupOrder(signature)),
    false
  );
});

test("WalletConnect relay JWTs remain compatible and reject malleable signatures", async () => {
  const keyPair = relayAuth.generateKeyPair(new Uint8Array(32).fill(7));
  const token = await relayAuth.signJWT(
    "test-wallet",
    "wss://relay.walletconnect.com",
    60,
    keyPair,
    1_700_000_000
  );
  assert.equal(await relayAuth.verifyJWT(token), true);

  const decoded = relayAuth.decodeJWT(token);
  const changed = relayAuth.encodeJWT({
    ...decoded,
    signature: addGroupOrder(decoded.signature),
  });
  assert.equal(await relayAuth.verifyJWT(changed), false);
});
