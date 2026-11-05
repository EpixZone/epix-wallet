// Run with: node --test scripts/provider-bootstrap.test.cjs
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test, mock } = require("node:test");
const { createContext, runInContext } = require("node:vm");
const ts = require("typescript");

const root = resolve(__dirname, "..");
const extensionRoot = resolve(root, "apps/extension");
const extensionId = require("../apps/extension/src/manifest.v2.firefox.json")
  .applications.gecko.id;
const source = readFileSync(
  resolve(extensionRoot, "src/content-scripts/inject/injected-script.ts"),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;

function documentFixture() {
  const listeners = new Map();
  const announcements = [];
  const providers = [];
  const injected = [];
  const window = {
    location: { origin: "https://talk.epix" },
    postMessage: mock.fn(),
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler(event);
    },
  };
  window.addEventListener("eip6963:announceProvider", (event) => {
    announcements.push(event.detail);
  });

  // Run the real bootstrap with dependencies stubbed to avoid wallet/RPC work.
  // Construction records the discovery listener that each provider installs.
  class InjectedKeplr {
    constructor(...args) {
      this.transport = args[5];
      this.info = args[7];
      this.ethereum = {};
      this.__core__webpageClosed = mock.fn();
      providers.push(this);
      const announce = () =>
        window.dispatchEvent({
          type: "eip6963:announceProvider",
          detail: { info: this.info, provider: this.ethereum },
        });
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    }
  }
  const imports = {
    "@keplr-wallet/provider": {
      InjectedKeplr,
      injectKeplrToWindow: (provider) => injected.push(provider),
    },
    starknet: {},
    uuid: { v4: randomUUID },
    "../../manifest.v2.json": require("../apps/extension/src/manifest.v2.json"),
  };
  const context = createContext({ window, console, process: { env: {} } });
  const evaluate = (identity = extensionId) => {
    context.process.env = {
      EPIX_MV2_PROVIDER_ID: identity,
      KEPLR_EXT_EIP6963_PROVIDER_INFO_NAME: "Epix Wallet",
      KEPLR_EXT_EIP6963_PROVIDER_INFO_RDNS: "zone.epix.wallet",
    };
    // A fresh module scope models separately evaluated copies of the bundle.
    const bootstrap = runInContext(
      `(function(require, exports) { ${compiled}\n })`,
      context
    );
    bootstrap((name) => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    }, {});
  };
  return { evaluate, window, listeners, providers, injected, announcements };
}

test("evaluating the MV2 bootstrap twice creates one provider and announcement handler", () => {
  const f = documentFixture();
  f.evaluate();
  f.evaluate();

  assert.equal(f.providers.length, 1);
  assert.equal(f.injected.length, 1);
  assert.equal(f.announcements.length, 1);
  assert.equal(f.listeners.get("eip6963:requestProvider").size, 1);
  assert.equal(f.listeners.get("beforeunload").size, 1);
  f.window.dispatchEvent({ type: "eip6963:requestProvider" });
  assert.equal(f.announcements.length, 2);
  assert.equal(f.announcements[0].provider, f.announcements[1].provider);
  const request = { type: "test-request" };
  f.providers[0].transport.postMessage(request);
  const sent = f.window.postMessage.mock.calls[0].arguments;
  assert.equal(sent.length, 2);
  assert.equal(sent[0], request);
  assert.equal(sent[1], "https://talk.epix");
});

test("independent documents each receive their own provider", () => {
  const first = documentFixture();
  const second = documentFixture();
  for (const f of [first, second]) {
    f.evaluate();
    f.evaluate();
    assert.equal(f.providers.length, 1);
  }
  assert.notEqual(first.providers[0], second.providers[0]);
  assert.notEqual(first.providers[0].info.uuid, second.providers[0].info.uuid);
});

test("distinct extension identities are preserved even with matching wallet metadata", () => {
  const f = documentFixture();
  for (const identity of [extensionId, "other-wallet@example.test"]) {
    f.evaluate(identity);
    f.evaluate(identity);
  }
  assert.equal(f.providers.length, 2);
  assert.equal(f.listeners.get("eip6963:requestProvider").size, 2);
  assert.equal(f.providers[0].info.rdns, f.providers[1].info.rdns);
  assert.notEqual(f.providers[0].ethereum, f.providers[1].ethereum);
});

test("an existing unrelated wallet does not suppress this extension", () => {
  const f = documentFixture();
  const otherProvider = { isKeplr: true, isMetaMask: true };
  f.window.ethereum = otherProvider;
  f.window.keplr = { ethereum: otherProvider };
  f.evaluate();
  assert.equal(f.providers.length, 1);
  assert.equal(f.window.ethereum, otherProvider);
});

test("MV3 bootstrap behavior is unchanged", () => {
  const f = documentFixture();
  f.evaluate("");
  f.evaluate("");
  assert.equal(f.providers.length, 2);
  assert.equal(Object.getOwnPropertySymbols(f.window).length, 0);
});

for (const manifestV2 of [true, false]) {
  test(`the production build scopes the guard to MV2=${manifestV2}`, () => {
    const definitions = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-e",
          `const config = require('./webpack.config.js');
           const values = Object.assign({}, ...config.plugins.map(p => p.definitions || {}));
           console.log(JSON.stringify(values));`,
        ],
        {
          cwd: extensionRoot,
          env: { ...process.env, BUILD_MANIFEST_V2: String(manifestV2) },
          encoding: "utf8",
        }
      )
    );
    assert.equal(
      definitions["process.env.EPIX_MV2_PROVIDER_ID"],
      JSON.stringify(manifestV2 ? extensionId : "")
    );
  });
}
