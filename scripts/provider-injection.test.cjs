// Run with: node --test scripts/provider-injection.test.cjs
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test, mock } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

// Exercise the production entry-point blocks without starting the keyring,
// network services or extension UI. Both blocks must agree on who injects.
function injectionBlock(relativePath, operation) {
  const file = resolve(__dirname, "../apps/extension/src", relativePath);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const blocks = source.statements.filter(
    (statement) =>
      ts.isIfStatement(statement) &&
      statement.getText(source).includes(operation)
  );
  assert.equal(blocks.length, 1);
  return ts.transpileModule(blocks[0].getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

const background = injectionBlock(
  "background/background.ts",
  "registerContentScripts("
);
const content = injectionBlock(
  "content-scripts/content-scripts.ts",
  "document.createElement("
);

function browserFixture(manifestVersion, hasChrome = true, registrationError) {
  const registered = [];
  const inserted = [];
  const runtime = {
    getManifest: () => ({ manifest_version: manifestVersion }),
    getURL: (path) => `moz-extension://wallet/${path}`,
  };
  const registerContentScripts = mock.fn(async (scripts) => {
    if (registrationError) throw registrationError;
    registered.push(...scripts);
  });
  const getRegisteredContentScripts = mock.fn(async ({ ids }) =>
    registered.filter((script) => ids.includes(script.id))
  );
  const unregisterContentScripts = mock.fn(async ({ ids }) => {
    for (const id of ids) {
      const index = registered.findIndex((script) => script.id === id);
      if (index < 0) throw new Error(`No script with id ${id}`);
      registered.splice(index, 1);
    }
  });
  const warn = mock.fn();
  const sandbox = {
    chrome: hasChrome
      ? {
          runtime,
          scripting: {
            registerContentScripts,
            getRegisteredContentScripts,
            unregisterContentScripts,
          },
        }
      : undefined,
    browser: { runtime },
    console: { warn },
    document: {
      head: {
        children: [],
        insertBefore: (script) => inserted.push(script),
      },
      createElement: () => ({ src: "", type: "", remove: mock.fn() }),
    },
  };
  return {
    sandbox,
    registerContentScripts,
    getRegisteredContentScripts,
    unregisterContentScripts,
    registered,
    inserted,
    warn,
  };
}

const settle = () => new Promise((done) => setImmediate(done));

test("removes only the stale MV2 provider registration before the next page loads", async () => {
  const f = browserFixture(2);
  f.registered.push({ id: "injectedScript" }, { id: "unrelatedScript" });
  runInNewContext(background, f.sandbox);
  await settle();
  runInNewContext(content, f.sandbox);

  assert.equal(
    f.registered.filter((script) => script.id === "injectedScript").length +
      f.inserted.length,
    1
  );
  assert.deepEqual(f.registered, [{ id: "unrelatedScript" }]);
  assert.deepEqual(
    structuredClone(f.unregisterContentScripts.mock.calls[0].arguments),
    [{ ids: ["injectedScript"] }]
  );
  assert.equal(f.registerContentScripts.mock.calls.length, 0);
  assert.equal(f.warn.mock.calls.length, 0);
});

test("skips MV2 cleanup when no previous provider registration exists", async () => {
  const f = browserFixture(2);
  runInNewContext(background, f.sandbox);
  await settle();

  assert.equal(f.getRegisteredContentScripts.mock.calls.length, 1);
  assert.equal(f.unregisterContentScripts.mock.calls.length, 0);
  assert.equal(f.warn.mock.calls.length, 0);
});

test("keeps MV2 injection working when the scripting API is unavailable", async () => {
  const f = browserFixture(2);
  delete f.sandbox.chrome.scripting;
  runInNewContext(background, f.sandbox);
  await settle();
  runInNewContext(content, f.sandbox);

  assert.equal(f.inserted.length, 1);
  assert.equal(f.warn.mock.calls.length, 0);
});

test("does not remove existing MV3 registrations", async () => {
  const f = browserFixture(3, true, new Error("Already registered"));
  f.registered.push({ id: "injectedScript" });
  runInNewContext(background, f.sandbox);
  await settle();

  assert.deepEqual(f.registered, [{ id: "injectedScript" }]);
  assert.equal(f.getRegisteredContentScripts.mock.calls.length, 0);
  assert.equal(f.unregisterContentScripts.mock.calls.length, 0);
});

test("injects once in Firefox MV2 even when MAIN-world registration is supported", () => {
  const f = browserFixture(2);
  runInNewContext(background, f.sandbox);
  runInNewContext(content, f.sandbox);

  assert.equal(f.registered.length + f.inserted.length, 1);
  assert.equal(f.registerContentScripts.mock.calls.length, 0);
  assert.equal(
    f.inserted[0].src,
    "moz-extension://wallet/injectedScript.bundle.js"
  );
});

test("injects once through MAIN-world registration in MV3", () => {
  const f = browserFixture(3);
  runInNewContext(background, f.sandbox);
  runInNewContext(content, f.sandbox);

  assert.deepEqual(structuredClone(f.registered), [
    {
      id: "injectedScript",
      matches: ["<all_urls>"],
      js: ["injectedScript.bundle.js"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: true,
    },
  ]);
  assert.equal(f.inserted.length, 0);
});

test("preserves script-element injection without the Chrome API namespace", () => {
  const f = browserFixture(2, false);
  runInNewContext(background, f.sandbox);
  runInNewContext(content, f.sandbox);

  assert.equal(f.registerContentScripts.mock.calls.length, 0);
  assert.equal(f.inserted.length, 1);
});

test("reports failed MV3 registration without an unhandled rejection", async () => {
  const f = browserFixture(3, true, new Error("unavailable"));
  runInNewContext(background, f.sandbox);
  await settle();

  assert.equal(f.warn.mock.calls.length, 1);
  assert.equal(f.registered.length, 0);
});
