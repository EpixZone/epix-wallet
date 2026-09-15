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
    "http://[::1]/path",
  ])("always routes loopback directly for %s", (url) => {
    expect(routeEpixRequest(url, true, true, "Always")).toBeNull();
  });

  it("uses a real direct route as soon as clearnet-over-Tor is off", () => {
    expect(
      routeEpixRequest("https://example.com", false, true, "Always")
    ).toBeNull();
  });

  it.each([false, true])(
    "preserves onion routing when clearnet-over-Tor is %s",
    (clearnetOverTor) => {
      expect(
        routeEpixRequest(
          `http://${"a".repeat(56)}.onion/path`,
          clearnetOverTor,
          false,
          "Disabled"
        )
      ).toBeUndefined();
    }
  );

  it.each(["Always", "OK", "Bootstrapping", "Recovering", "Failed"])(
    "keeps general clearnet on SOCKS while Tor status is %s",
    (status) => {
      expect(
        routeEpixRequest("https://example.com", true, false, status)
      ).toEqual([
        {
          type: "socks",
          host: "127.0.0.1",
          port: 43111,
          proxyDNS: true,
        },
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
      routeEpixRequest("https://example.com", true, false, null)
    ).toBeUndefined();
  });

  it("treats the epix.zone apex as general clearnet", () => {
    expect(routeEpixRequest("https://epix.zone", true, true, "Always")).toEqual(
      [
        {
          type: "socks",
          host: "127.0.0.1",
          port: 43111,
          proxyDNS: true,
        },
      ]
    );
  });
});

describe("native status polling", () => {
  let onMessage: (message: any) => Promise<any>;
  let route: (details: { url: string }) => any;
  let sendNativeMessage: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
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
      browserAction: { setIcon: jest.fn() },
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (globalThis as any).browser;
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
      });

      expect((await statusReply).status.tor_clearnet).toBe(on);
      expect(route({ url: "https://example.com" })).toEqual(
        on
          ? [{ type: "socks", host: "127.0.0.1", port: 43111, proxyDNS: true }]
          : null
      );
    }
  );
});
