// Run against the real production output after the Firefox build.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const directory = process.argv[2];
assert.ok(
  directory,
  "Usage: node scripts/firefox-browser-runtime-check.cjs BUILD_DIR"
);
for (const name of ["LICENSE", "NOTICE"]) {
  assert.deepEqual(
    fs.readFileSync(path.join(directory, name + ".txt")),
    fs.readFileSync(path.join(__dirname, "..", name)),
    "Firefox package must include the project " + name
  );
}
assert.equal(
  fs.existsSync(path.join(directory, "keplr-earn-product-terms.html")),
  false,
  "Firefox package must omit the retired Noble Earn terms"
);
const bundles = fs
  .readdirSync(directory)
  .filter((name) => name.endsWith(".bundle.js"));
assert.ok(bundles.length > 0, "Firefox bundles are missing");
for (const name of bundles) {
  const source = fs.readFileSync(path.join(directory, name), "utf8");
  // Check the removed legacy branches without hiding other dependency findings.
  assert.ok(
    !/\bFunction\(\s*["']/.test(source),
    `${name}: string-based Function constructor`
  );
  assert.ok(
    !/eval\(["']\[function _expression_function/.test(source),
    `${name}: Lottie expression engine`
  );
}
console.log(
  `Verified runtime fallbacks are absent from ${bundles.length} Firefox bundles`
);
