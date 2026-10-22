import { installEndpointHealthForeground } from "./endpoint-health-foreground";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function target() {
  const handlers = new Map<string, Set<(event: any) => void>>();
  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (type: string, handler: (event: any) => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
    },
    removeEventListener: (type: string, handler: (event: any) => void) => {
      handlers.get(type)?.delete(handler);
    },
    emit: (type: string, event: unknown = {}) =>
      handlers.get(type)?.forEach((handler) => handler(event)),
    count: () =>
      Array.from(handlers.values()).reduce(
        (sum, handlers) => sum + handlers.size,
        0
      ),
  };
}

it("refreshes each visible view, coalesces focus and removes listeners on close", async () => {
  const view = target();
  const document = target();
  let release!: () => void;
  const refresh = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  const check = jest.fn(async () => undefined);
  installEndpointHealthForeground(
    view as any,
    document as any,
    refresh,
    check,
    jest.fn()
  );
  view.emit("focus");
  document.emit("visibilitychange");
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(check).not.toHaveBeenCalled();
  release();
  await flush();
  expect(check).toHaveBeenCalledTimes(1);
  document.visibilityState = "hidden";
  view.emit("focus");
  expect(refresh).toHaveBeenCalledTimes(1);
  document.visibilityState = "visible";
  document.emit("visibilitychange");
  expect(refresh).toHaveBeenCalledTimes(2);
  view.emit("pagehide", { persisted: false });
  release();
  await flush();
  expect(check).toHaveBeenCalledTimes(1);
  expect(view.count() + document.count()).toBe(0);
});

it("a failed refresh can recover on focus and a cached page keeps its listeners", async () => {
  const view = target();
  const document = target();
  const error = new Error("background restarting");
  const refresh = jest
    .fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValue(undefined);
  const check = jest.fn(async () => undefined);
  const report = jest.fn();
  const dispose = installEndpointHealthForeground(
    view as any,
    document as any,
    refresh,
    check,
    report
  );
  await flush();
  expect(report).toHaveBeenCalledWith(error);
  view.emit("pagehide", { persisted: true });
  view.emit("focus");
  await flush();
  expect(check).toHaveBeenCalledTimes(1);
  dispose();
  expect(view.count() + document.count()).toBe(0);
});
