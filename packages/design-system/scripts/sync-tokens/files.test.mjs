import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { iconFilePath, writeFileAtomic } from "./files.mjs";

test("atomic writes replace a destination symlink without changing its target", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "token-files-test-"));
  try {
    const target = path.join(directory, "target");
    const output = path.join(directory, "output");
    fs.writeFileSync(target, "original");
    fs.symlinkSync(target, output);
    writeFileAtomic(output, "generated");
    assert.equal(fs.readFileSync(target, "utf8"), "original");
    assert.equal(fs.readFileSync(output, "utf8"), "generated");
    assert.deepEqual(fs.readdirSync(directory).sort(), ["output", "target"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("icon paths reject traversal, separators, and source-code punctuation", () => {
  const directory = path.resolve("components");
  assert.equal(
    iconFilePath(directory, "arrow-up"),
    path.join(directory, "arrow-up-icon.tsx")
  );
  for (const name of [
    "../escape",
    "..\\escape",
    "/absolute",
    "a/b",
    "a\\b",
    "a'",
    "",
    "a\0b",
    "a\nb",
    "a\n",
  ]) {
    assert.throws(() => iconFilePath(directory, name));
  }
});
