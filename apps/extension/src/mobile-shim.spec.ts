describe("mobile localStorage hydration", () => {
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
    expect(host.localStorage.length).toBe(0);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { cmd: "remove", key: "epix-ls/preference" },
        }),
      ])
    );
  });
});
