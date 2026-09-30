import { closeRegistrationPage } from "./close-page";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalBrowser = Object.getOwnPropertyDescriptor(globalThis, "browser");
const getCurrent = jest.fn();
const remove = jest.fn();
const close = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(globalThis, "browser", {
    configurable: true,
    value: { tabs: { getCurrent, remove } },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { close },
  });
});

afterEach(() => {
  for (const [name, descriptor] of [
    ["window", originalWindow],
    ["browser", originalBrowser],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test.each([0, 42])(
  "closes its own tab %i without a script window close",
  async (id) => {
    getCurrent.mockResolvedValue({ id });
    close.mockImplementation(() => {
      throw new Error("Scripts may only close windows opened by a script");
    });

    await closeRegistrationPage();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(id);
    expect(close).not.toHaveBeenCalled();
  }
);

test("uses window.close for an action popup without a tab", async () => {
  getCurrent.mockResolvedValue(undefined);

  await closeRegistrationPage();

  expect(remove).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

test("does not close a window when finding its tab fails", async () => {
  getCurrent.mockRejectedValue(new Error("Tab lookup failed"));

  await expect(closeRegistrationPage()).rejects.toThrow("Tab lookup failed");

  expect(remove).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

test("does not treat a tab with an unavailable ID as an action popup", async () => {
  getCurrent.mockResolvedValue({});

  await expect(closeRegistrationPage()).rejects.toThrow(
    "Registration tab has no ID"
  );

  expect(remove).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

test("reports a rejected tab close without a second window-close attempt", async () => {
  getCurrent.mockResolvedValue({ id: 42 });
  remove.mockRejectedValue(new Error("Host rejected tab close"));

  await expect(closeRegistrationPage()).rejects.toThrow(
    "Host rejected tab close"
  );

  expect(remove).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
});
