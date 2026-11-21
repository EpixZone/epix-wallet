// Run after the real extension build, before publishing either browser target.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const build = path.resolve(process.argv[2] || "apps/extension/build");
const apis = [
  ["Chrome side panel", /\.sidePanel\b/],
  ["worker session storage", /\.storage\.session\b/],
];
for (const [target, version] of [
  ["firefox", 2],
  ["manifest-v3", 3],
]) {
  const directory = path.join(build, target);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8")
  );
  assert.equal(manifest.manifest_version, version, `Wrong ${target} manifest`);
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".js"));
  assert.ok(files.length > 0, `Missing ${target} JavaScript output`);
  const found = new Set();
  for (const name of files) {
    const source = fs.readFileSync(path.join(directory, name), "utf8");
    for (const [api, pattern] of apis) {
      if (!pattern.test(source)) continue;
      assert.notEqual(version, 2, `${target}/${name} contains ${api}`);
      found.add(api);
    }
  }
  if (version === 3) {
    for (const [api] of apis) assert.ok(found.has(api), `MV3 lost ${api}`);
  }
}
console.log("Firefox omits worker-only APIs; Chrome MV3 retains them.");
