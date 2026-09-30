import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

// Exercise the CommonJS copy consumed by the Ethereum dependency, including
// its own BN version. Noble is the wallet's independent signing implementation.
const signingRequire = createRequire(
  require.resolve("@ethersproject/signing-key")
);
const elliptic = signingRequire("elliptic");
const ellipticRequire = createRequire(signingRequire.resolve("elliptic"));
const BN = ellipticRequire("bn.js");
const { SigningKey } = signingRequire("@ethersproject/signing-key");
const cryptoRequire = createRequire(
  new URL("../packages/crypto/package.json", import.meta.url)
);
const { secp256k1 } = cryptoRequire("@noble/curves/secp256k1");
const { p256 } = cryptoRequire("@noble/curves/p256");
const { p521 } = cryptoRequire("@noble/curves/p521");

function signatureValues(signature) {
  return {
    r: signature.r.toString(16),
    s: signature.s.toString(16),
  };
}

test("P-521 preserves the leading zero byte of its deterministic nonce", () => {
  // SHA-512("elliptic compatibility 93") yields an RFC 6979 DRBG candidate
  // beginning with 0x00 for private key 1. Elliptic 6.6.1 loses that byte and
  // skips the required seven-bit truncation. Verification alone cannot detect
  // this bug: both the old and corrected signatures verify mathematically.
  const digest = createHash("sha512")
    .update("elliptic compatibility 93")
    .digest();
  const key = Buffer.alloc(66);
  key[65] = 1;
  const curve = new elliptic.ec("p521");
  const signature = curve.sign(digest, key, { canonical: true });
  const reference = p521.sign(digest, key, { lowS: true, prehash: false });

  assert.deepEqual(signatureValues(signature), signatureValues(reference));
  assert.deepEqual(signatureValues(signature), {
    r:
      "1be5dca94b62cf72fa1310f250756da07d702e09a54bfd72462a47aed54668d26" +
      "d0ed13c03f1cee0ee2d4511ec1fd72df06840e8f83c92161a610b910506accd3b0",
    s:
      "ca7fe6910d205fa0f745cff3f565c4a4f9228c3bd5b4eeea4fa5211432a8b922" +
      "6470837ce6641d5d298f7ceb26d1df247c8061d0be6b25abbce243a967603a7f14",
  });
  assert.equal(
    curve.verify(digest, signature, curve.keyFromPrivate(key)),
    true
  );
});

test("wallet secp256k1 and P-256 signatures remain compatible with Noble", () => {
  const key = Buffer.alloc(32);
  key[31] = 1;
  const signingKey = new SigningKey(key);
  for (const [name, reference] of [
    ["secp256k1", secp256k1],
    ["p256", p256],
  ]) {
    const curve = new elliptic.ec(name);
    for (let i = 0; i < 256; i++) {
      const digest = createHash("sha256")
        .update(`elliptic compatibility ${i}`)
        .digest();
      const expected = signatureValues(
        reference.sign(digest, key, { lowS: true, prehash: false })
      );
      assert.deepEqual(
        signatureValues(curve.sign(digest, key, { canonical: true })),
        expected
      );
      if (name === "secp256k1") {
        const consumerSignature = signingKey.signDigest(digest);
        assert.equal(BigInt(consumerSignature.r).toString(16), expected.r);
        assert.equal(BigInt(consumerSignature.s).toString(16), expected.s);
      }
    }
  }
});

test("custom nonce callbacks retain their values and retry iteration numbers", () => {
  const curve = new elliptic.ec("p521");
  const digest = createHash("sha512")
    .update("custom nonce regression")
    .digest();
  const key = curve.keyFromPrivate("01", "hex");
  const nonce = new BN(1358);
  const calls = [];
  const signature = curve.sign(digest, key, {
    canonical: true,
    k(iteration) {
      calls.push(iteration);
      // The first candidate remains invalid and must trigger another call.
      return iteration === 0 ? new BN(0) : nonce;
    },
  });
  assert.deepEqual(calls, [0, 1]);
  assert.equal(nonce.toString(), "1358");
  assert.equal(
    signature.r.toString(16),
    curve.g.mul(nonce).getX().umod(curve.n).toString(16)
  );
  assert.equal(curve.verify(digest, signature, key), true);
  assert.equal(signature.s.cmp(curve.nh) <= 0, true);
});

test("existing signing input validation remains intact", () => {
  const curve = new elliptic.ec("secp256k1");
  const key = curve.keyFromPrivate("01", "hex");
  for (const invalid of [-1, new BN(-1), [-1], [256], [1.5], { length: -1 }]) {
    assert.throws(() => curve.sign(invalid, key));
  }
  const digest = createHash("sha256").update("valid input encodings").digest();
  const expected = signatureValues(curve.sign(digest, key));
  assert.deepEqual(signatureValues(curve.sign([...digest], key)), expected);
  assert.deepEqual(
    signatureValues(curve.sign(digest.toString("hex"), key)),
    expected
  );
});
