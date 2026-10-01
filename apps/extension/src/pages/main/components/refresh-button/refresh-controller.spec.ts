import { autorun } from "mobx";
import { MemoryKVStore } from "@keplr-wallet/common";
import { ObservableQuery, QuerySharedContext } from "@keplr-wallet/stores";
import {
  isWalletRefreshRoute,
  startWalletRefresh,
  WalletRefreshEvent,
} from "./refresh-controller";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

class TestDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

function setup(refresh = jest.fn().mockResolvedValue(undefined)) {
  const document = new TestDocument();
  const window = new EventTarget();
  let unlocked = true;
  const onStart = jest.fn();
  const onSettled = jest.fn();
  const onError = jest.fn();
  const controller = startWalletRefresh({
    document,
    window,
    intervalMs: 15000,
    canRefresh: () => unlocked,
    refresh,
    onStart,
    onSettled,
    onError,
  });
  return {
    document,
    window,
    refresh,
    controller,
    onError,
    onStart,
    onSettled,
    lock: () => (unlocked = false),
    unlock: () => (unlocked = true),
  };
}

describe("wallet balance refresh lifecycle", () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ["setImmediate"] }));
  afterEach(() => jest.useRealTimers());

  it("updates a continuously observed zero balance after an external deposit", async () => {
    let remoteBalance = "0";
    class TestBalance extends ObservableQuery<string> {
      constructor() {
        super(
          new QuerySharedContext(new MemoryKVStore("balance-refresh"), {
            responseDebounceMs: 0,
          }),
          "https://example.invalid",
          ""
        );
      }
      protected override fetchResponse() {
        return Promise.resolve({ headers: {}, data: remoteBalance });
      }
    }
    const query = new TestBalance();
    let shownBalance: string | undefined;
    const stopObserving = autorun(() => {
      shownBalance = query.response?.data;
    });
    const test = setup(
      jest.fn(() => query.waitFreshResponse().then(() => undefined))
    );
    await flush();
    jest.advanceTimersByTime(1);
    await flush();
    expect(shownBalance).toBe("0");
    remoteBalance = "1000000000000000000000";
    jest.advanceTimersByTime(15000);
    await flush();
    await flush();
    jest.advanceTimersByTime(1);
    await flush();
    expect(shownBalance).toBe(remoteBalance);
    test.controller.dispose();
    stopObserving();
  });

  it("pauses while hidden or locked and refreshes on visibility and focus", async () => {
    const test = setup();
    await flush();
    expect(test.refresh).toHaveBeenCalledTimes(1);
    test.document.visibilityState = "hidden";
    jest.advanceTimersByTime(45000);
    await flush();
    test.window.dispatchEvent(new Event("focus"));
    await flush();
    expect(test.refresh).toHaveBeenCalledTimes(1);
    test.document.visibilityState = "visible";
    test.lock();
    test.document.dispatchEvent(new Event("visibilitychange"));
    jest.advanceTimersByTime(15000);
    await flush();
    expect(test.refresh).toHaveBeenCalledTimes(1);
    test.unlock();
    test.document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(test.refresh).toHaveBeenCalledTimes(2);
    test.window.dispatchEvent(new Event("focus"));
    await flush();
    expect(test.refresh).toHaveBeenCalledTimes(3);
    test.controller.dispose();
  });

  it("coalesces in-flight requests and reads the new account for a queued refresh", async () => {
    let account = "first";
    let finish: () => void = () => undefined;
    const addresses: string[] = [];
    const refresh = jest.fn(() => {
      addresses.push(account);
      return new Promise<void>((resolve) => (finish = resolve));
    });
    const test = setup(refresh);
    await flush();
    jest.advanceTimersByTime(45000);
    await flush();
    expect(addresses).toEqual(["first"]);
    account = "second";
    void test.controller.refresh();
    test.window.dispatchEvent(new Event("focus"));
    test.window.dispatchEvent(new Event(WalletRefreshEvent));
    finish();
    await flush();
    expect(addresses).toEqual(["first", "second"]);
    expect(refresh.mock.calls[1]).toEqual(["manual"]);
    finish();
    await flush();
    test.controller.dispose();
  });

  it("removes timers and listeners and discards queued work on disposal", async () => {
    let finish: () => void = () => undefined;
    const test = setup(
      jest.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    );
    await flush();
    test.window.dispatchEvent(new Event(WalletRefreshEvent));
    test.controller.dispose();
    finish();
    await flush();
    test.window.dispatchEvent(new Event("focus"));
    test.window.dispatchEvent(new Event(WalletRefreshEvent));
    test.document.dispatchEvent(new Event("visibilitychange"));
    jest.advanceTimersByTime(60000);
    await flush();
    expect(test.refresh).toHaveBeenCalledTimes(1);
    expect(test.onSettled).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("reports a failed manual refresh and allows retry", async () => {
    const test = setup();
    await flush();
    const error = new Error("offline");
    test.refresh.mockRejectedValueOnce(error);
    test.window.dispatchEvent(new Event(WalletRefreshEvent));
    await flush();
    expect(test.onError).toHaveBeenCalledWith(error, "manual");
    expect(test.onSettled).toHaveBeenLastCalledWith("manual");
    test.window.dispatchEvent(new Event(WalletRefreshEvent));
    await flush();
    expect(test.refresh).toHaveBeenCalledTimes(3);
    test.controller.dispose();
  });
});

it("shows manual refresh on browsing routes without covering signing or forms", () => {
  for (const path of [
    "/",
    "/history",
    "/stake",
    "/stake/validators",
    "/stake/validator/epix/val",
    "/tx-history-detail/epix/msg",
  ]) {
    expect(isWalletRefreshRoute(path)).toBe(true);
  }
  for (const path of [
    "/send",
    "/sign-ethereum",
    "/stake/delegate/epix/val",
    "/stake/undelegate/epix/val",
    "/setting",
    "/unlock",
  ]) {
    expect(isWalletRefreshRoute(path)).toBe(false);
  }
});
