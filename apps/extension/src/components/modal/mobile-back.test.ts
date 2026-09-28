import { bindModalBack } from "./mobile-back";

function fixture() {
  const entries: any[] = [{ idx: 4, page: "home" }];
  let index = 0;
  const listeners = new Set<(event: { state: unknown }) => void>();
  const history = {
    get state() {
      return entries[index];
    },
    pushState(state: unknown) {
      entries.splice(++index);
      entries[index] = state;
    },
    back: jest.fn(() => {
      index--;
      listeners.forEach((listener) => listener({ state: entries[index] }));
    }),
  };
  const browser = {
    history,
    addEventListener: (_: string, listener: any) => listeners.add(listener),
    removeEventListener: (_: string, listener: any) =>
      listeners.delete(listener),
  };
  return { browser: browser as unknown as Window, history, listeners };
}

test("Back closes the modal without traversing the underlying page", () => {
  const { browser, history, listeners } = fixture();
  const close = jest.fn();
  const dispose = bindModalBack(close, browser);
  expect(history.state.idx).toBe(4);
  history.back();
  expect(close).toHaveBeenCalledTimes(1);
  dispose();
  expect(history.back).toHaveBeenCalledTimes(1);
  expect(history.state).toEqual({ idx: 4, page: "home" });
  expect(listeners.size).toBe(0);
});

test("closing through the UI removes the modal history entry", () => {
  const { browser, history } = fixture();
  const close = jest.fn();
  const dispose = bindModalBack(close, browser);
  dispose();
  expect(history.back).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  expect(history.state.page).toBe("home");
});

test("Back dismisses nested modals one at a time", () => {
  const { browser, history } = fixture();
  const parent = jest.fn(),
    child = jest.fn();
  const disposeParent = bindModalBack(parent, browser);
  const disposeChild = bindModalBack(child, browser);
  history.back();
  expect(child).toHaveBeenCalledTimes(1);
  expect(parent).not.toHaveBeenCalled();
  disposeChild();
  history.back();
  expect(parent).toHaveBeenCalledTimes(1);
  disposeParent();
  expect(history.back).toHaveBeenCalledTimes(2);
});

test("unmount after route navigation does not undo the new route", () => {
  const { browser, history } = fixture();
  const dispose = bindModalBack(jest.fn(), browser);
  history.pushState({ idx: 5, page: "settings" });
  dispose();
  expect(history.back).not.toHaveBeenCalled();
  expect(history.state.page).toBe("settings");
});
