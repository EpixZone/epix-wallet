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
