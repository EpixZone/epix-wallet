import type { SceneTransitionRef } from "../../../components/transition";
import { v4 as uuidv4 } from "uuid";

// Only a depth marker goes into browser history. Recovery words, keys and
// passwords stay in the existing in-memory scenes.
export function bindRegisterNavigation(
  getScene: () => SceneTransitionRef | null,
  browser: Pick<
    Window,
    | "history"
    | "addEventListener"
    | "removeEventListener"
    | "scrollTo"
    | "document"
  > = window
): () => void {
  const scene = getScene();
  if (!scene) return () => undefined;
  const owner = `register-${uuidv4()}`;
  let depth = scene.stack.length;
  let signature = scene.stack.join("/");
  let applyingHistory = false;
  const mark = (value: number) => ({
    ...browser.history.state,
    epixRegister: { owner, depth: value },
  });
  browser.history.replaceState(mark(depth), "");

  const onScene = (stack: ReadonlyArray<string>) => {
    const nextSignature = stack.join("/");
    if (nextSignature === signature) return;
    signature = nextSignature;
    const next = stack.length;
    const previous = depth;
    depth = next;
    if (!applyingHistory && next > previous) {
      for (let i = previous + 1; i <= next; i++) {
        browser.history.pushState(mark(i), "");
      }
    } else if (!applyingHistory && next < previous) {
      browser.history.go(next - previous);
    }
    // A new step starts at its title, without the previous step's keyboard.
    (browser.document.activeElement as HTMLElement | null)?.blur?.();
    browser.scrollTo(0, 0);
  };
  const onPop = (event: PopStateEvent) => {
    const target = event.state?.epixRegister;
    const current = getScene();
    if (!current || target?.owner !== owner) return;
    const next = target.depth;
    if (!Number.isInteger(next) || next < 1) return;
    if (next > current.stack.length) {
      // Popped forms are intentionally discarded. Do not resurrect them with
      // Forward or persist secret form values to make that possible.
      browser.history.go(current.stack.length - next);
      return;
    }
    depth = next;
    const count = current.stack.length - next;
    applyingHistory = true;
    try {
      for (let i = 0; i < count; i++) current.pop();
    } finally {
      applyingHistory = false;
    }
  };
  scene.addSceneChangeListener(onScene);
  browser.addEventListener("popstate", onPop as EventListener);
  return () => {
    scene.removeSceneChangeListener(onScene);
    browser.removeEventListener("popstate", onPop as EventListener);
  };
}
