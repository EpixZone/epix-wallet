import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const extensionRequire = createRequire(
  new URL("../apps/extension/package.json", import.meta.url)
);
const cryptoRequire = createRequire(
  new URL("../packages/crypto/package.json", import.meta.url)
);
const webpack = extensionRequire("webpack");
const { secp256k1 } = cryptoRequire("@noble/curves/secp256k1");
const { p521 } = cryptoRequire("@noble/curves/p521");
const {
  inspectElliptic,
  inspectModule,
  EllipticBuildGuardPlugin,
} = require("./elliptic-build-guard.cjs");
const root = fileURLToPath(new URL("../", import.meta.url));
let temporary;
let browser;
let modules;

before(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), "elliptic-browser-"));
  const entry = path.join(temporary, "entry.js");
  await writeFile(
    entry,
    `export { SigningKey, computePublicKey, recoverPublicKey } from "@ethersproject/signing-key";
     import elliptic from "elliptic";
     export const EC = elliptic.ec;`
  );
  const compiler = webpack({
    mode: "production",
    target: "web",
    entry,
    output: {
      path: temporary,
      filename: "browser.js",
      library: { type: "commonjs2" },
    },
    resolve: {
      modules: [path.join(root, "node_modules")],
      mainFields: ["browser", "module", "main"],
      fallback: { buffer: extensionRequire.resolve("buffer/") },
    },
    module: {
      rules: [{ test: /\.m?js$/, resolve: { fullySpecified: false } }],
    },
    optimization: { concatenateModules: false },
    plugins: [new EllipticBuildGuardPlugin()],
  });
  const stats = await new Promise((resolve, reject) => {
    compiler.run((error, result) => {
      compiler.close((closeError) => {
        if (error || closeError) reject(error || closeError);
        else resolve(result);
      });
    });
  });
  assert.equal(
    stats.hasErrors(),
    false,
    stats.toString({ all: false, errors: true })
  );
  modules = [...stats.compilation.modules].map((module) =>
    (module.resource || "").replaceAll("\\", "/")
  );
  browser = require(path.join(temporary, "browser.js"));
});

after(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test("browser SigningKey uses the ESM entry and external patched EC", () => {
  assert(
    modules.some((name) =>
      name.endsWith("/@ethersproject/signing-key/lib.esm/index.js")
    )
  );
  assert(
    modules.some((name) => name.endsWith("/elliptic/lib/elliptic/ec/index.js"))
  );
  assert(
    !modules.some((name) =>
      name.endsWith("/@ethersproject/signing-key/lib.esm/elliptic.js")
    )
  );
});

test("browser secp256k1 signing, recovery, public keys and ECDH retain compatibility", () => {
  const key = Buffer.alloc(32);
  key[31] = 1;
  const other = Buffer.alloc(32);
  other[31] = 2;
  const signingKey = new browser.SigningKey(key);
  const commonJSKey = new (extensionRequire(
    "@ethersproject/signing-key"
  ).SigningKey)(key);
  assert.equal(signingKey.publicKey, commonJSKey.publicKey);
  assert.equal(signingKey.compressedPublicKey, commonJSKey.compressedPublicKey);
  assert.equal(browser.computePublicKey(key), commonJSKey.publicKey);
  for (const text of [
    "browser elliptic compatibility",
    "",
    "zero-leading digest test",
  ]) {
    const digest = createHash("sha256").update(text).digest();
    const actual = signingKey.signDigest(digest);
    const reference = secp256k1.sign(digest, key, {
      lowS: true,
      prehash: false,
    });
    assert.equal(BigInt(actual.r), reference.r);
    assert.equal(BigInt(actual.s), reference.s);
    assert.deepEqual(actual, commonJSKey.signDigest(digest));
    assert.equal(
      browser.recoverPublicKey(digest, actual),
      signingKey.publicKey
    );
  }
  const otherPublic = browser.computePublicKey(other);
  assert.equal(
    signingKey.computeSharedSecret(otherPublic),
    commonJSKey.computeSharedSecret(otherPublic)
  );
  assert.equal(
    signingKey._addPoint(otherPublic),
    commonJSKey._addPoint(otherPublic)
  );
  for (const invalid of [
    "0x",
    "0x01",
    Buffer.alloc(31),
    Buffer.alloc(33),
    [-1],
  ]) {
    assert.throws(() => signingKey.signDigest(invalid));
    assert.throws(() => new browser.SigningKey(invalid));
  }
});

test("the external EC in browser output retains nonce bytes and input validation", () => {
  // This tests the bundled dependency directly; SigningKey only supports secp256k1.
  const digest = createHash("sha512")
    .update("elliptic compatibility 93")
    .digest();
  const key = Buffer.alloc(66);
  key[65] = 1;
  const ec = new browser.EC("p521");
  const actual = ec.sign(digest, key, { canonical: true });
  const reference = p521.sign(digest, key, { lowS: true, prehash: false });
  assert.equal(BigInt(`0x${actual.r.toString(16)}`), reference.r);
  assert.equal(BigInt(`0x${actual.s.toString(16)}`), reference.s);
  for (const invalid of [-1, [-1], [256], [1.5], { length: -1 }]) {
    assert.throws(() => ec.sign(invalid, key));
  }
});

test("guard rejects the upstream browser copy and the prepatch nonce conversion", async () => {
  const vendored = path.join(
    path.dirname(require.resolve("@ethersproject/signing-key/package.json")),
    "lib.esm/elliptic.js"
  );
  const oldSource = await readFile(vendored, "utf8");
  assert.throws(() => inspectModule(vendored, oldSource), /bypasses our patch/);
  // Also reject embedded copies independently of the dependency path or name.
  assert.throws(
    () => inspectElliptic(oldSource, "arbitrary-bundle.js"),
    /nonce bytes/
  );
  const source = await readFile(
    require.resolve("elliptic/lib/elliptic/ec/index.js"),
    "utf8"
  );
  assert.equal(inspectElliptic(source, "patched.js"), 1);
  const regressed = source.replace(
    "this._truncateToN(drbg.generate(this.n.byteLength()), true)",
    "this._truncateToN(new BN(drbg.generate(this.n.byteLength())), true)"
  );
  assert.notEqual(regressed, source);
  assert.throws(
    () => inspectElliptic(regressed, "regressed.js"),
    /nonce bytes/
  );
});
