import assert from "node:assert/strict";
import test from "node:test";
import { forEachBatch } from "./batches.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("bounds in-flight work and consumes results in input order", async () => {
  const first = deferred();
  const second = deferred();
  const third = deferred();
  third.resolve(3);
  const started = [];
  const consumed = [];
  let active = 0;
  let peak = 0;
  const completed = forEachBatch([first, second, third], 2, async (batch) => {
    const results = await Promise.all(
      batch.map(async (item) => {
        if (item === third) assert.deepEqual(consumed, [1, 2]);
        started.push(item);
        active++;
        peak = Math.max(peak, active);
        const value = await item.promise;
        active--;
        return value;
      })
    );
    consumed.push(...results);
  });
  assert.deepEqual(started, [first, second]);
  second.resolve(2);
  await second.promise;
  assert.equal(started.length, 2);
  assert.deepEqual(consumed, []);
  first.resolve(1);
  await completed;
  assert.equal(peak, 2);
  assert.deepEqual(consumed, [1, 2, 3]);
});

test("stops scheduling after a failed batch", async () => {
  const seen = [];
  await assert.rejects(
    forEachBatch([1, 2, 3], 2, async (batch) => {
      seen.push(...batch);
      throw new Error("Export failed");
    }),
    /Export failed/
  );
  assert.deepEqual(seen, [1, 2]);
});

test("skips empty input and rejects invalid batch sizes", async () => {
  await forEachBatch([], 4, () => assert.fail("No batch should start"));
  await Promise.all(
    [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].map((size) =>
      assert.rejects(
        forEachBatch([1], size, () => assert.fail("No batch should start")),
        RangeError
      )
    )
  );
});
