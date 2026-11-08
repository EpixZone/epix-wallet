import { routeEpixRequest } from "./epix-native";

describe("routeEpixRequest", () => {
  it.each([
    "https://talk.epix/path",
    "https://epix1epxrwflutk4j2saxuy84wvv52tdepuep8yqcqk/path",
    "http://example.i2p/path",
    "https://api.epix.zone/path",
  ])("preserves the launcher's dedicated route for %s", (url) => {
    expect(routeEpixRequest(url, true, true, "Always")).toBeUndefined();
  });

  it.each([
    "http://localhost/path",
    "http://127.0.0.1/path",
    "http://127.0.0.2/path",
    "http://127.255.255.254/path",
    "http://127.1/path",
    "http://[0:0:0:0:0:0:0:1]/path",
    "http://[::1]/path",
    "http://epix-epix1dashanwfts3qcflekhmkvcz66ss4kxz2tr2k6g.localhost:42225/index.html",
    "http://alice.localhost/path",
    "http://nested.alice.localhost/path",
    "http://LOCALHOST./path",
    "http://ALICE.LOCALHOST./path",
  ])("always routes loopback directly for %s", (url) => {
    expect(routeEpixRequest(url, true, true, "Always")).toBeNull();
  });

  it.each([
    "http://localhost.example/path",
    "http://evil-localhost/path",
    "http://notlocalhost/path",
    "http://127.attacker.example/path",
    "http://127.0.0.1.attacker.example/path",
    "http://128.0.0.1/path",
    "http://192.168.1.1/path",
    "http://[::ffff:127.0.0.1]/path",
    "http://epix-xite.localhost.example/path",
    "http://localhost@attacker.example/path",
  ])("keeps localhost lookalikes on the required Tor route for %s", (url) => {
    expect(routeEpixRequest(url, true, false, "Failed", 44217)).toEqual([
      { type: "socks", host: "127.0.0.1", port: 44217, proxyDNS: true },
      null,
    ]);
  });

  it("uses a real direct route as soon as clearnet-over-Tor is off", () => {
    expect(
      routeEpixRequest("https://example.com", false, true, "Always")
    ).toBeNull();
  });

  it.each([false, true])(
    "uses the owned onion route when clearnet-over-Tor is %s",
    (clearnetOverTor) => {
      expect(
        routeEpixRequest(
          `http://${"a".repeat(56)}.onion/path`,
          clearnetOverTor,
          false,
          "Disabled",
          44217
        )
      ).toEqual([
        { type: "socks", host: "127.0.0.1", port: 44217, proxyDNS: true },
        null,
      ]);
    }
  );

  it.each(["Always", "OK", "Bootstrapping", "Recovering", "Failed"])(
    "keeps general clearnet on SOCKS while Tor status is %s",
    (status) => {
      expect(
        routeEpixRequest("https://example.com", true, false, status, 44217)
      ).toEqual([
        {
          type: "socks",
          host: "127.0.0.1",
          port: 44217,
          proxyDNS: true,
        },
        null,
      ]);
    }
  );

  it("uses direct mode when Tor is explicitly disabled", () => {
    expect(
      routeEpixRequest("https://example.com", true, false, "Disabled")
    ).toBeNull();
  });

  it("defers to the launch PAC until routing state is known", () => {
    expect(
      routeEpixRequest("https://example.com", null, null, null)
    ).toBeUndefined();
    expect(
      routeEpixRequest(`http://${"a".repeat(56)}.onion/`, null, null, null)
    ).toBeUndefined();
  });

  it("treats the epix.zone apex as general clearnet", () => {
    expect(
      routeEpixRequest("https://epix.zone", true, true, "Always", 44217)
    ).toEqual([
      {
        type: "socks",
        host: "127.0.0.1",
        port: 44217,
        proxyDNS: true,
      },
      null,
    ]);
  });
});

describe("native status polling", () => {
  let onMessage: (message: any) => Promise<any>;
  let route: (details: { url: string }) => any;
  let beforeRequest: (details: { url: string; proxyInfo?: object }) => any;
  let sendNativeMessage: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers({ doNotFake: ["setImmediate"] });
    sendNativeMessage = jest.fn();
    (globalThis as any).browser = {
      runtime: {
        onMessage: {
          addListener: (listener: typeof onMessage) => (onMessage = listener),
        },
        sendNativeMessage,
      },
      proxy: {
        onRequest: {
          addListener: (listener: typeof route) => (route = listener),
        },
      },
      webRequest: {
        onBeforeRequest: {
          addListener: jest.fn((listener: typeof beforeRequest) => {
            beforeRequest = listener;
          }),
        },
      },
      browserAction: { setIcon: jest.fn() },
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (globalThis as any).browser;
  });

  it.each([
    "http://epix-epix1dashanwfts3qcflekhmkvcz66ss4kxz2tr2k6g.localhost:42225/index.html",
    "http://127.0.0.2:42225/index.html",
    "http://[::1]:42225/index.html",
  ])(
    "keeps local content usable without a native Tor endpoint: %s",
    async (url) => {
      sendNativeMessage.mockResolvedValue({
        tor_clearnet: true,
        tor_enabled: false,
        tor_status: "Failed",
      });
      const { initEpixNative } = await import("./epix-native");
      initEpixNative();
      await onMessage({ type: "epix-status" });

      expect(route({ url })).toBeNull();
      expect(beforeRequest({ url })).toBeUndefined();
      expect(
        beforeRequest({ url: "http://localhost.attacker.example/" })
      ).toEqual({ cancel: true });
    }
  );

  it("routes through the node's selected SOCKS port", async () => {
    sendNativeMessage.mockResolvedValue({
      tor_clearnet: true,
      tor_enabled: true,
      tor_status: "OK",
      tor_socks_port: 44217,
    });
    const { initEpixNative } = await import("./epix-native");
    initEpixNative();
    await onMessage({ type: "epix-status" });

    expect(route({ url: "https://example.com" })).toEqual([
      { type: "socks", host: "127.0.0.1", port: 44217, proxyDNS: true },
      null,
    ]);
  });

  it("cancels Tor-routed traffic when the node has no owned SOCKS port", async () => {
    sendNativeMessage.mockResolvedValue({
      tor_clearnet: true,
      tor_enabled: false,
      tor_status: "Bootstrapping",
    });
    const { initEpixNative } = await import("./epix-native");
    initEpixNative();
    await onMessage({ type: "epix-status" });

    expect(beforeRequest({ url: "https://example.com" })).toEqual({
      cancel: true,
    });
  });

  it.each([1, 42322, 65535])("accepts owned SOCKS port %s", async (port) => {
    sendNativeMessage.mockResolvedValue({
      tor_clearnet: true,
      tor_enabled: true,
      tor_status: "Always",
      tor_socks_port: port,
    });
    const { initEpixNative } = await import("./epix-native");
    initEpixNative();
    await onMessage({ type: "epix-status" });
    const proxyInfo = {
      type: "socks",
      host: "127.0.0.1",
      port,
      proxyDNS: true,
    };
    expect(route({ url: "https://example.com" })).toEqual([proxyInfo, null]);
    expect(beforeRequest({ url: "https://example.com", proxyInfo })).toEqual({
      cancel: false,
    });
  });

  it.each([
    undefined,
    null,
    0,
    -1,
    65536,
    42322.5,
    "42322",
    NaN,
    Infinity,
    true,
  ])(
    "rejects invalid SOCKS port %s and discards the old endpoint",
    async (port) => {
      sendNativeMessage.mockResolvedValue({
        tor_clearnet: true,
        tor_enabled: true,
        tor_status: "Always",
        tor_socks_port: 44217,
      });
      const { initEpixNative } = await import("./epix-native");
      initEpixNative();
      await onMessage({ type: "epix-status" });
      sendNativeMessage.mockResolvedValue({ tor_socks_port: port });
      await onMessage({ type: "epix-status" });

      expect(route({ url: "https://example.com" })).toBeUndefined();
      expect(beforeRequest({ url: "https://example.com" })).toEqual({
        cancel: true,
      });
      expect(beforeRequest({ url: `http://${"a".repeat(56)}.onion/` })).toEqual(
        {
          cancel: true,
        }
      );
    }
  );

  it("blocks a direct or stale proxy chosen before the status changed", async () => {
    sendNativeMessage.mockResolvedValue({
      tor_clearnet: true,
      tor_enabled: true,
      tor_status: "Always",
      tor_socks_port: 44217,
    });
    const { initEpixNative } = await import("./epix-native");
    initEpixNative();
    await onMessage({ type: "epix-status" });
    const proxy = {
      type: "socks",
      host: "127.0.0.1",
      port: 44217,
      proxyDNS: true,
    };
    for (const proxyInfo of [
      undefined,
      { ...proxy, type: "direct" },
      { ...proxy, host: "untrusted.example" },
      { ...proxy, port: 43111 },
      { ...proxy, proxyDNS: false },
    ]) {
      expect(beforeRequest({ url: "https://example.com", proxyInfo })).toEqual({
        cancel: true,
      });
    }
  });

  it("invalidates the endpoint after native status fails and recovers on a fresh reply", async () => {
    const status = {
      tor_clearnet: true,
      tor_enabled: true,
      tor_status: "Always",
      tor_socks_port: 44217,
    };
    sendNativeMessage.mockResolvedValue(status);
    const { initEpixNative } = await import("./epix-native");
    initEpixNative();
    await onMessage({ type: "epix-status" });
    sendNativeMessage.mockRejectedValue(new Error("native host unavailable"));
    expect((await onMessage({ type: "epix-status" })).ok).toBe(false);
    expect(beforeRequest({ url: "https://example.com" })).toEqual({
      cancel: true,
    });

    sendNativeMessage.mockResolvedValue({ ...status, tor_socks_port: 44218 });
    await onMessage({ type: "epix-status" });
    expect(route({ url: "https://example.com" })[0].port).toBe(44218);
  });

  it.each(["incomplete", "failed"])(
    "does not retain old Disabled routing after %s native status",
    async (response) => {
      sendNativeMessage.mockResolvedValue({
        tor_clearnet: true,
        tor_enabled: false,
        tor_status: "Disabled",
        tor_socks_port: 44217,
      });
      const { initEpixNative } = await import("./epix-native");
      initEpixNative();
      await onMessage({ type: "epix-status" });
      expect(route({ url: "https://example.com" })).toBeNull();
      if (response === "failed") {
        sendNativeMessage.mockRejectedValue(
          new Error("native host unavailable")
        );
      } else {
        sendNativeMessage.mockResolvedValue({ serving: false });
      }
      await onMessage({ type: "epix-status" });
      expect(beforeRequest({ url: "https://example.com" })).toEqual({
        cancel: true,
      });
    }
  );

  it("keeps explicit direct and dedicated routes usable without an endpoint", async () => {
    sendNativeMessage.mockResolvedValue({
      tor_clearnet: true,
      tor_status: "Recovering",
    });
    const { initEpixNative } = await import("./epix-native");
    initEpixNative();
    await onMessage({ type: "epix-status" });
    for (const url of [
      "http://127.0.0.1:42229/Config",
      "https://talk.epix/",
      "http://example.i2p/",
      "https://api.epix.zone/",
    ]) {
      expect(beforeRequest({ url })).toBeUndefined();
    }
    sendNativeMessage.mockResolvedValue({ ok: true });
    await onMessage({ type: "epix-set-tor-clearnet", on: false });
    expect(beforeRequest({ url: "https://example.com" })).toBeUndefined();
    expect(route({ url: "https://example.com" })).toBeNull();
  });

  it("cancels an explicit Tor request with incomplete initial status", async () => {
    sendNativeMessage.mockResolvedValue({ tor_clearnet: true });
    const { initEpixNative } = await import("./epix-native");
    initEpixNative();
    await onMessage({ type: "epix-status" });
    expect(beforeRequest({ url: "https://example.com" })).toEqual({
      cancel: true,
    });
    expect(
      (globalThis as any).browser.webRequest.onBeforeRequest.addListener
    ).toHaveBeenCalledWith(expect.any(Function), { urls: ["<all_urls>"] }, [
      "blocking",
    ]);
  });

  it("shares an outstanding status request across startup, toolbar and UI", async () => {
    sendNativeMessage.mockReturnValue(new Promise(() => undefined));
    const { initEpixNative } = await import("./epix-native");
    initEpixNative();
    onMessage({ type: "epix-status" });
    jest.advanceTimersByTime(15000);

    expect(sendNativeMessage).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "does not let an older status reply undo a successful toggle to %s",
    async (on) => {
      let resolveStatus!: (status: object) => void;
      const pendingStatus = new Promise((resolve) => (resolveStatus = resolve));
      sendNativeMessage.mockImplementation((_host, message) =>
        message.cmd === "status" ? pendingStatus : Promise.resolve({ ok: true })
      );
      const { initEpixNative } = await import("./epix-native");
      initEpixNative();
      const statusReply = onMessage({ type: "epix-status" });
      await onMessage({ type: "epix-set-tor-clearnet", on });
      resolveStatus({
        tor_clearnet: !on,
        tor_enabled: true,
        tor_status: "OK",
        tor_socks_port: 44217,
      });

      expect((await statusReply).status.tor_clearnet).toBe(on);
      expect(route({ url: "https://example.com" })).toEqual(
        on
          ? [
              { type: "socks", host: "127.0.0.1", port: 44217, proxyDNS: true },
              null,
            ]
          : null
      );
    }
  );

  it("retries the toolbar icon after an asynchronous paint failure", async () => {
    const globals = globalThis as any;
    const previous = {
      fetch: globals.fetch,
      createImageBitmap: globals.createImageBitmap,
      OffscreenCanvas: globals.OffscreenCanvas,
    };
    globals.fetch = jest
      .fn()
      .mockResolvedValue({ blob: () => Promise.resolve({}) });
    globals.createImageBitmap = jest.fn().mockResolvedValue({});
    globals.OffscreenCanvas = jest.fn().mockImplementation(() => ({
      getContext: () => ({
        drawImage: jest.fn(),
        beginPath: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        getImageData: jest.fn().mockReturnValue({}),
      }),
    }));
    globals.browser.runtime.getURL = (path: string) => path;
    const setIcon = globals.browser.browserAction.setIcon;
    setIcon.mockRejectedValueOnce(new Error("toolbar unavailable"));
    setIcon.mockResolvedValue(undefined);
    sendNativeMessage.mockResolvedValue({
      tor_enabled: true,
      tor_status: "OK",
    });

    try {
      const { initEpixNative } = await import("./epix-native");
      initEpixNative();
      await new Promise(setImmediate);
      expect(setIcon).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5000);
      await new Promise(setImmediate);
      expect(setIcon).toHaveBeenCalledTimes(2);
    } finally {
      Object.assign(globals, previous);
    }
  });
});
