import {
  ENDPOINT_HEALTH_ALARM,
  installEndpointHealthChecks,
} from "./endpoint-health-checks";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(existing?: object) {
  const listeners = new Set<(alarm: { name: string }) => void>();
  const alarms = {
    get: jest.fn(async () => existing),
    create: jest.fn(),
    onAlarm: {
      addListener: (listener: (alarm: { name: string }) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (alarm: { name: string }) => void) => {
        listeners.delete(listener);
      },
    },
  };
  return {
    alarms,
    wake: (name = ENDPOINT_HEALTH_ALARM) =>
      listeners.forEach((listener) => listener({ name })),
    listeners,
  };
}

it("registers before initialization, recreates a lost alarm and coalesces wakeups", async () => {
  const f = fixture();
  const ready = deferred();
  const pass = deferred();
  const initialize = jest.fn(() => ready.promise);
  const check = jest.fn(() => pass.promise);
  const dispose = installEndpointHealthChecks(
    f.alarms,
    initialize,
    check,
    jest.fn()
  );
  expect(f.listeners.size).toBe(1);
  f.wake();
  f.wake();
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(check).not.toHaveBeenCalled();
  ready.resolve();
  await flush();
  expect(f.alarms.create).toHaveBeenCalledWith(ENDPOINT_HEALTH_ALARM, {
    periodInMinutes: 1,
  });
  expect(check).toHaveBeenCalledTimes(1);
  f.wake();
  expect(check).toHaveBeenCalledTimes(1);
  pass.resolve();
  await flush();
  f.wake("unrelated");
  expect(check).toHaveBeenCalledTimes(1);
  f.wake();
  await flush();
  expect(check).toHaveBeenCalledTimes(2);
  dispose();
  expect(f.listeners.size).toBe(0);
});

it("retains an existing alarm, reports failed checks and accepts a later wakeup", async () => {
  const f = fixture({ name: ENDPOINT_HEALTH_ALARM });
  const error = new Error("storage unavailable");
  const check = jest
    .fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValue(undefined);
  const report = jest.fn();
  const dispose = installEndpointHealthChecks(
    f.alarms,
    async () => undefined,
    check,
    report
  );
  await flush();
  expect(f.alarms.create).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledWith(error);
  f.wake();
  await flush();
  expect(check).toHaveBeenCalledTimes(2);
  dispose();
});

it("does not start probes after disposal during initialization", async () => {
  const f = fixture();
  const ready = deferred();
  const check = jest.fn();
  const dispose = installEndpointHealthChecks(
    f.alarms,
    () => ready.promise,
    check,
    jest.fn()
  );
  dispose();
  ready.resolve();
  await flush();
  expect(check).not.toHaveBeenCalled();
  expect(f.alarms.create).not.toHaveBeenCalled();
});
