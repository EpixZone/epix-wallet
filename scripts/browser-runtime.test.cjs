const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extension = path.resolve(__dirname, "../apps/extension");

test("native bind preserves the dependency's supported Firefox behavior", () => {
  const bind = require("../apps/extension/browser-native-bind.cjs");
  assert.equal(bind, require("function-bind"));
  function sum(a, b) {
    return this.offset + a + b;
  }
  const bound = bind.call(sum, { offset: 10 }, 2);
  assert.equal(bound(3), 15);
  assert.equal(bound.length, 1);
  function Pair(first, second) {
    this.values = [first, second];
  }
  const pair = new (bind.call(Pair, null, 7))(9);
  assert.ok(pair instanceof Pair);
  assert.deepEqual(pair.values, [7, 9]);
  assert.throws(() => bind.call({}, null), TypeError);
});

function checkAnimation(value, location) {
  if (!value || typeof value !== "object") return;
  assert.notEqual(
    typeof value.x,
    "string",
    `${location}: expression requires full Lottie`
  );
  assert.ok(!value.ef?.length, `${location}: effect requires full Lottie`);
  for (const [key, child] of Object.entries(value)) {
    checkAnimation(child, `${location}.${key}`);
  }
}

test("bundled animation assets support Lottie's official SVG light player", () => {
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith(".json"))
        checkAnimation(JSON.parse(fs.readFileSync(file, "utf8")), file);
    }
  }
  visit(path.join(extension, "src/public/assets/lottie"));
});

test("browser immediates run cancellable callbacks in separate tasks", async (t) => {
  const vm = require("node:vm");
  const channel = new MessageChannel();
  t.after(() => {
    channel.port1.close();
    channel.port2.close();
  });
  const browser = vm.createContext({
    MessageChannel: function () {
      return channel;
    },
  });
  const source = fs.readFileSync(
    path.join(extension, "src/immediate.js"),
    "utf8"
  );
  vm.runInContext(source, browser);
  const { setImmediate, clearImmediate } = browser;
  vm.runInContext(source, browser);
  assert.equal(browser.setImmediate, setImmediate);
  assert.equal(browser.clearImmediate, clearImmediate);
  assert.throws(() => setImmediate("text"), /callback function/);

  const order = [];
  const token = {};
  const finished = new Promise((resolve) => {
    setImmediate(
      (first, second) => {
        assert.equal(first, token);
        order.push(second);
        queueMicrotask(() => order.push("between"));
        setImmediate(resolve);
      },
      token,
      "first"
    );
    const cancelled = setImmediate(() => order.push("cancelled"));
    clearImmediate(cancelled);
    setImmediate(() => order.push("second"));
  });
  queueMicrotask(() => order.push("before"));
  await finished;
  assert.deepEqual(order, ["before", "first", "between", "second"]);
});
