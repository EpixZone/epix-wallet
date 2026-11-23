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

const requireExtension = require("node:module").createRequire(
  path.join(extension, "package.json")
);

test("browser dependencies can resolve native generator and typed array intrinsics", () => {
  const getIntrinsic = requireExtension("get-intrinsic");
  assert.equal(
    getIntrinsic("%GeneratorFunction%"),
    function* () {}.constructor
  );
  assert.equal(
    getIntrinsic("%AsyncFunction%"),
    async function () {}.constructor
  );
  assert.equal(
    getIntrinsic("%AsyncGeneratorFunction%"),
    async function* () {}.constructor
  );
  const getBuffer = getIntrinsic("TypedArray.prototype.buffer", true);
  const foreign = require("node:vm").runInNewContext("new Uint16Array(4)");
  assert.equal(getBuffer.call(foreign), foreign.buffer);
  assert.equal(getIntrinsic("Math.noSuchProperty", true), undefined);
  assert.throws(() => getIntrinsic("Math.noSuchProperty"), TypeError);
});

test("the browser generator check recognizes generators across realms", () => {
  const isGenerator = requireExtension("is-generator-function");
  const generator = function* () {};
  const foreign = require("node:vm").runInNewContext("(function* () {})");
  assert.equal(isGenerator(generator), true);
  assert.equal(isGenerator(generator.bind(null)), true);
  assert.equal(isGenerator(foreign), true);
  assert.equal(
    isGenerator(async function* () {}),
    false
  );
  assert.equal(
    isGenerator(() => {}),
    false
  );
  assert.equal(
    isGenerator({ [Symbol.toStringTag]: "GeneratorFunction" }),
    false
  );
});

test("Lodash browser entry points preserve debounce and throttle behavior", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  function calls(schedule) {
    const calls = [];
    const update = schedule(
      function (value) {
        calls.push([this.id, value]);
        return value;
      },
      60_000,
      { leading: true, trailing: true }
    );
    const receiver = { id: 1, update };
    const returns = [receiver.update(1), receiver.update(2), update.flush()];
    receiver.update(3);
    update.cancel();
    returns.push(update.flush());
    return { calls, returns };
  }
  for (const name of ["debounce", "throttle"]) {
    const behavior = calls(requireExtension(`lodash/${name}`));
    assert.deepEqual(behavior, calls(requireExtension(`lodash.${name}`)));
    assert.deepEqual(behavior.calls, [
      [1, 1],
      [1, 2],
    ]);
  }
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
