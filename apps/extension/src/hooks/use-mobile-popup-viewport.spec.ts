import { trackMobilePopupViewport } from "./use-mobile-popup-viewport";

class FakeEvents {
  readonly listeners = new Map<string, Set<() => void>>();

  addEventListener = (type: string, listener: () => void) => {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  };

  removeEventListener = (type: string, listener: () => void) => {
    const listeners = this.listeners.get(type);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.listeners.delete(type);
  };

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeVisualViewport extends FakeEvents {
  height = 840;
  offsetTop = 0;
  scale = 1;
}

class FakeWindow extends FakeEvents {
  innerHeight = 1182;
  visualViewport: FakeVisualViewport | undefined = new FakeVisualViewport();
  readonly frames = new Map<number, FrameRequestCallback>();
  private frameId = 0;

  requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
    const id = ++this.frameId;
    this.frames.set(id, callback);
    return id;
  });

  cancelAnimationFrame = jest.fn((id: number) => {
    this.frames.delete(id);
  });

  flushFrame() {
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    for (const callback of callbacks) callback(0);
  }
}

function fixture() {
  const win = new FakeWindow();
  const viewport = win.visualViewport as FakeVisualViewport;
  const properties = new Map<string, string>();
  const dataset: DOMStringMap = {};
  const root = {
    style: {
      setProperty: jest.fn((key: string, value: string) => {
        properties.set(key, value);
      }),
      removeProperty: jest.fn((key: string) => {
        properties.delete(key);
      }),
    },
    dataset,
  };
  return {
    win,
    viewport,
    root,
    properties,
    dataset,
    start: () =>
      trackMobilePopupViewport(
        win as unknown as Window,
        root as unknown as HTMLElement
      ),
  };
}

it("uses the visual height immediately when Gecko retains a stale innerHeight", () => {
  const { start, win, properties, dataset } = fixture();
  const stop = start();
  expect(win.innerHeight).toBe(1182);
  expect(properties.get("--wallet-viewport-height")).toBe("840px");
  expect(properties.get("--wallet-viewport-top")).toBe("0px");
  expect(dataset["mobilePopupViewport"]).toBe("true");
  expect(win.frames.size).toBe(0);
  stop();
});

it("shrinks for the keyboard and expands after close without a layout resize", () => {
  const { start, win, viewport, properties } = fixture();
  const stop = start();
  for (const height of [476, 840]) {
    viewport.height = height;
    viewport.emit("resize");
    win.flushFrame();
    expect(properties.get("--wallet-viewport-height")).toBe(`${height}px`);
    expect(win.innerHeight).toBe(1182);
  }
  stop();
});

it("tracks visual scrolling and clamps negative viewport offsets", () => {
  const { start, win, viewport, properties } = fixture();
  const stop = start();
  for (const [offset, expected] of [
    [36.5, "36.5px"],
    [-12, "0px"],
  ] as const) {
    viewport.offsetTop = offset;
    viewport.emit("scroll");
    win.flushFrame();
    expect(properties.get("--wallet-viewport-top")).toBe(expected);
    expect(properties.get("--wallet-viewport-height")).toBe("840px");
  }
  stop();
});

it("falls back to window resize when VisualViewport is unavailable", () => {
  const { start, win, properties } = fixture();
  win.visualViewport = undefined;
  const stop = start();
  expect(properties.get("--wallet-viewport-height")).toBe("1182px");
  win.innerHeight = 480;
  win.emit("resize");
  win.flushFrame();
  expect(properties.get("--wallet-viewport-height")).toBe("480px");
  expect(properties.get("--wallet-viewport-top")).toBe("0px");
  stop();
});

it("does not reflow during pinch zoom and resumes when normal scale returns", () => {
  const { start, win, viewport, root, properties } = fixture();
  const stop = start();
  viewport.scale = 1.5;
  viewport.height = 400;
  viewport.offsetTop = 90;
  viewport.emit("resize");
  viewport.emit("scroll");
  win.emit("resize");
  win.flushFrame();
  expect(properties.get("--wallet-viewport-height")).toBe("840px");
  expect(properties.get("--wallet-viewport-top")).toBe("0px");
  expect(root.style.setProperty).toHaveBeenCalledTimes(2);
  viewport.scale = 1;
  viewport.height = 600;
  viewport.offsetTop = 0;
  viewport.emit("resize");
  win.flushFrame();
  expect(properties.get("--wallet-viewport-height")).toBe("600px");
  stop();
});

it.each([0, -1, NaN, Infinity, -Infinity])(
  "ignores invalid initial and subsequent height %p",
  (height) => {
    const { start, win, viewport, properties, dataset } = fixture();
    viewport.height = height;
    const stop = start();
    expect(properties.size).toBe(0);
    expect(dataset).toEqual({});
    viewport.height = 840;
    viewport.emit("resize");
    win.flushFrame();
    viewport.height = height;
    viewport.emit("resize");
    win.flushFrame();
    expect(properties.get("--wallet-viewport-height")).toBe("840px");
    stop();
  }
);

it.each([NaN, Infinity, -Infinity])(
  "preserves prior geometry for invalid visual offset %p",
  (offset) => {
    const { start, win, viewport, properties } = fixture();
    const stop = start();
    viewport.offsetTop = offset;
    viewport.height = 400;
    viewport.emit("scroll");
    win.flushFrame();
    expect(properties.get("--wallet-viewport-height")).toBe("840px");
    expect(properties.get("--wallet-viewport-top")).toBe("0px");
    stop();
  }
);

it("batches resize and scroll events into one update using the latest geometry", () => {
  const { start, win, viewport, root, properties } = fixture();
  const stop = start();
  viewport.height = 470;
  viewport.emit("resize");
  viewport.offsetTop = 20;
  viewport.emit("scroll");
  win.emit("resize");
  viewport.height = 600;
  viewport.offsetTop = 32;
  expect(win.frames.size).toBe(1);
  expect(root.style.setProperty).toHaveBeenCalledTimes(2);
  win.flushFrame();
  expect(properties.get("--wallet-viewport-height")).toBe("600px");
  expect(properties.get("--wallet-viewport-top")).toBe("32px");
  expect(root.style.setProperty).toHaveBeenCalledTimes(4);
  expect(root.dataset["mobilePopupViewport"]).toBe("true");
  stop();
});

it("cleans up pending frames, listeners and only its own root styles and marker", () => {
  const { start, win, viewport, root, properties, dataset } = fixture();
  properties.set("color", "red");
  dataset["other"] = "kept";
  const stop = start();
  viewport.height = 476;
  viewport.emit("resize");
  expect(win.frames.size).toBe(1);
  expect([...win.listeners.keys()]).toEqual(["resize"]);
  expect([...viewport.listeners.keys()]).toEqual(["resize", "scroll"]);
  stop();
  expect(win.frames.size).toBe(0);
  expect(win.listeners.size).toBe(0);
  expect(viewport.listeners.size).toBe(0);
  expect([...properties.entries()]).toEqual([["color", "red"]]);
  expect(dataset).toEqual({ other: "kept" });
  win.emit("resize");
  viewport.emit("resize");
  viewport.emit("scroll");
  win.flushFrame();
  expect(root.style.setProperty).toHaveBeenCalledTimes(2);
  expect(dataset).toEqual({ other: "kept" });
});
