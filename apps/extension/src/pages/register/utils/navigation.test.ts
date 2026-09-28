import { bindRegisterNavigation } from "./navigation";
import type { SceneTransitionRef } from "../../../components/transition";

function fixture() {
  let stack = ["intro"];
  const listeners = new Set<(stack: string[]) => void>();
  const events = new Set<(event: { state: unknown }) => void>();
  const entries: any[] = [{ routerState: "preserved" }];
  let index = 0;
  const notify = () => listeners.forEach((listener) => listener(stack));
  const history = {
    get state() {
      return entries[index];
    },
    replaceState: (state: unknown) => {
      entries[index] = state;
    },
    pushState: (state: unknown) => {
      entries.splice(++index);
      entries[index] = state;
    },
    go: jest.fn((delta: number) => {
      index += delta;
      events.forEach((listener) => listener({ state: entries[index] }));
    }),
  };
  const scene = {
    get stack() {
      return stack;
    },
    push: (name: string) => {
      stack = [...stack, name];
      notify();
    },
    pop: () => {
      stack = stack.slice(0, -1);
      notify();
    },
    replaceAll: (name: string) => {
      stack = [name];
      notify();
    },
    addSceneChangeListener: (listener: (stack: string[]) => void) =>
      listeners.add(listener),
    removeSceneChangeListener: (listener: (stack: string[]) => void) =>
      listeners.delete(listener),
  };
  const browser = {
    history,
    document: { activeElement: { blur: jest.fn() } },
    scrollTo: jest.fn(),
    addEventListener: (_: string, listener: any) => events.add(listener),
    removeEventListener: (_: string, listener: any) => events.delete(listener),
  };
  const dispose = bindRegisterNavigation(
    () => scene as unknown as SceneTransitionRef,
    browser as unknown as Window
  );
  return { scene, browser, entries, dispose, events, listeners, notify };
}

test("Android/browser Back and the in-page Back share the same step history", () => {
  const { scene, browser } = fixture();
  scene.push("existing-user");
  scene.push("recover-mnemonic");
  browser.history.go(-1);
  expect(scene.stack).toEqual(["intro", "existing-user"]);
  scene.pop();
  expect(browser.history.state.epixRegister.depth).toBe(1);
  expect(scene.stack).toEqual(["intro"]);
});

test("Forward cannot resurrect a discarded recovery form", () => {
  const { scene, browser } = fixture();
  scene.push("recover-mnemonic");
  browser.history.go(-1);
  browser.history.go(1);
  expect(scene.stack).toEqual(["intro"]);
  expect(browser.history.state.epixRegister.depth).toBe(1);
});

test("resetting the flow unwinds history and stores no form data", () => {
  const { scene, browser, entries } = fixture();
  scene.push("recover-mnemonic");
  scene.push("name-password");
  scene.replaceAll("finalize-key");
  expect(browser.history.state.epixRegister.depth).toBe(1);
  for (const entry of entries) {
    expect(Object.keys(entry.epixRegister).sort()).toEqual(["depth", "owner"]);
    expect(entry.routerState).toBe("preserved");
  }
  expect(browser.document.activeElement.blur).toHaveBeenCalled();
  expect(browser.scrollTo).toHaveBeenLastCalledWith(0, 0);
});

test("unmount removes both navigation listeners", () => {
  const { dispose, events, listeners } = fixture();
  dispose();
  expect(events.size).toBe(0);
  expect(listeners.size).toBe(0);
});

test("jumping back several steps does not create new forward entries", () => {
  const { scene, browser } = fixture();
  scene.push("existing-user");
  scene.push("recover-mnemonic");
  scene.push("name-password");
  browser.history.go(-3);
  expect(scene.stack).toEqual(["intro"]);
  expect(browser.history.state.epixRegister.depth).toBe(1);
  expect(browser.history.go).toHaveBeenCalledTimes(1);
});

test("updates to the current scene do not blur a focused input", () => {
  const { browser, notify } = fixture();
  notify();
  expect(browser.document.activeElement.blur).not.toHaveBeenCalled();
});
