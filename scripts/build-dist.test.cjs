// Run with: node --test scripts/build-dist.test.cjs
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

test("immutable wallet release points at the commit that was built", () => {
  const root = path.resolve(__dirname, "..");
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/build-dist.yml"),
    "utf8"
  );
  const publish = workflow.slice(
    workflow.indexOf("      - name: Publish immutable per-commit release")
  );
  const script = publish
    .split("        run: |\n")[1]
    .split("\n")
    .map((line) => line.slice(10))
    .join("\n");
  const sha = "0123456789abcdef0123456789abcdef01234567";
  // Replace gh with a shell function: exercise the actual workflow command
  // without creating a release or using credentials. An omitted --target
  // makes GitHub tag the default branch instead of the workflow's commit.
  const mock = `
function gh() {
  if [ "$1 $2" = "release view" ]; then return 1; fi
  if [ "$1 $2" = "release create" ]; then
    shift 2
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--target" ]; then printf '%s' "$2"; return 0; fi
      shift
    done
    printf 'default-branch-head'
    return 0
  fi
  if [ "$1 $2" = "release upload" ]; then return 0; fi
  return 1
}
`;
  const target = execFileSync("bash", ["-eu", "-c", mock + script], {
    cwd: root,
    env: { ...process.env, GITHUB_SHA: sha },
    encoding: "utf8",
  });
  assert.equal(target, sha);
});
