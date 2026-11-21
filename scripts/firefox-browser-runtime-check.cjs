// Run against the real production output after the Firefox build.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const directory = process.argv[2];
assert.ok(
  directory,
  "Usage: node scripts/firefox-browser-runtime-check.cjs BUILD_DIR"
);
const bundles = fs
  .readdirSync(directory)
  .filter((name) => name.endsWith(".bundle.js"));
assert.ok(bundles.length > 0, "Firefox bundles are missing");
let nativeGlobalRuntimes = 0;
for (const name of bundles) {
  const source = fs.readFileSync(path.join(directory, name), "utf8");
  // Check the removed legacy branches without hiding other dependency findings.
  assert.ok(
    !/new Function\(["']return this["']\)/.test(source),
    `${name}: legacy global runtime`
  );
  assert.ok(
    !/Function\(["']binder["']/.test(source),
    `${name}: legacy bind fallback`
  );
  assert.ok(
    !/eval\(["']\[function _expression_function/.test(source),
    `${name}: Lottie expression engine`
  );
  if (/\.g=globalThis/.test(source)) nativeGlobalRuntimes++;
}
assert.ok(
  nativeGlobalRuntimes > 0,
  "Firefox must use Webpack's native globalThis runtime"
);
console.log(
  `Verified ${bundles.length} Firefox bundles and ${nativeGlobalRuntimes} native global runtimes`
);
