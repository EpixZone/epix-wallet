describe("mobile browser shim", () => {
  let host: any;
  let requests: Array<{ id: number; op: { cmd: string; key?: string } }>;
  const globals = globalThis as any;

  beforeEach(async () => {
    jest.resetModules();
    requests = [];
    host = {
      location: { href: "http://localhost/wallet/mobile.html" },
      webkit: {
        messageHandlers: {
          epixClose: { postMessage: jest.fn() },
          epixStore: {
            postMessage: (request: string) =>
              requests.push(JSON.parse(request)),
          },
        },
      },
    };
    globals.window = host;
    await import("./mobile-shim");
  });

  afterEach(() => {
    delete globals.window;
    delete globals.browser;
    delete globals.chrome;
  });

  it("closes the registration document through the native sheet bridge", async () => {
    const { closeRegistrationPage } = await import(
      "./pages/register/utils/close-page"
    );
    host.close = jest.fn(() => {
      throw new Error("Scripts may only close windows opened by a script");
    });

    await closeRegistrationPage();

    expect(
      host.webkit.messageHandlers.epixClose.postMessage
    ).toHaveBeenCalledWith("");
    expect(
      host.webkit.messageHandlers.epixClose.postMessage
    ).toHaveBeenCalledTimes(1);
    expect(host.close).not.toHaveBeenCalled();
  });

  async function replyToRead(): Promise<void> {
    const keys = requests.find((request) => request.op.cmd === "keys");
    expect(keys).toBeDefined();
    host.__epixStoreReply(keys?.id, ["epix-ls/preference"]);
    await Promise.resolve();
    const get = requests.find((request) => request.op.cmd === "get");
    expect(get).toBeDefined();
    host.__epixStoreReply(get?.id, "old value");
    await Promise.resolve();
  }

  it("preserves a write made before the initial native read finishes", async () => {
    host.localStorage.setItem("preference", "new value");
    await replyToRead();
    expect(host.localStorage.getItem("preference")).toBe("new value");
  });

  it("does not restore a key removed before the initial native read finishes", async () => {
    host.localStorage.removeItem("preference");
    await replyToRead();
    expect(host.localStorage.getItem("preference")).toBeNull();
  });

  it("does not repopulate storage after clear while the native read is pending", async () => {
    host.localStorage.clear();
    await replyToRead();
    expect(host.localStorage).toHaveLength(0);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { cmd: "remove", key: "epix-ls/preference" },
        }),
      ])
    );
  });

  it("keeps in-memory storage usable when native key enumeration fails", async () => {
    const keys = requests.find((request) => request.op.cmd === "keys");
    host.__epixStoreReply(keys?.id, undefined, "storage unavailable");
    await new Promise(setImmediate);

    host.localStorage.setItem("preference", "new value");
    expect(host.localStorage.getItem("preference")).toBe("new value");
  });

  it("preserves concurrent writes while another initial read fails", async () => {
    const keys = requests.find((request) => request.op.cmd === "keys");
    host.__epixStoreReply(keys?.id, ["epix-ls/failed", "epix-ls/preference"]);
    await Promise.resolve();
    const failed = requests.find(
      (request) => request.op.key === "epix-ls/failed"
    );
    const pending = requests.find(
      (request) => request.op.key === "epix-ls/preference"
    );
    host.__epixStoreReply(failed?.id, undefined, "read failed");
    await new Promise(setImmediate);

    host.localStorage.setItem("preference", "new value");
    host.__epixStoreReply(pending?.id, "old value");
    await new Promise(setImmediate);
    expect(host.localStorage.getItem("preference")).toBe("new value");
    expect(host.localStorage.getItem("failed")).toBeNull();
  });
});
