import {
  EPIX_OSMOSIS_DENOM,
  EPIX_PRICE_EXPIRY,
  EPIX_PRICE_MAX_AGE_MS,
  OSMOSIS_EPIX_URL,
  fetchEpixPrices,
  resolveEpixPrices,
} from "./epix";

const now = Date.parse("2026-10-01T18:30:00Z");
const cg = (usd: number, timestamp = now, extra = {}) => ({
  headers: new Headers(),
  data: { epix: { usd, last_updated_at: timestamp / 1000, ...extra } },
});
const osmo = (price: number, timestamp = now, extra = {}) => ({
  headers: new Headers({ date: new Date(timestamp).toUTCString() }),
  data: [
    {
      denom: EPIX_OSMOSIS_DENOM,
      exponent: 18,
      coingecko_id: "epix",
      price,
      ...extra,
    },
  ],
});

describe("Epix quote resolution", () => {
  it("averages matching USD quotes and keeps direct non-USD prices", () => {
    const result = resolveEpixPrices(
      cg(0.00007, now, { eur: 0.000062 }),
      osmo(0.000072),
      ["usd", "eur", "jpy"],
      now
    );
    expect(result["usd"]).toBe(0.000071);
    expect(result["eur"]).toBe(0.000062);
    expect(result["jpy"]).toBeUndefined();
    expect(result[EPIX_PRICE_EXPIRY]).toBe(now + EPIX_PRICE_MAX_AGE_MS);
  });

  it("accepts the 20% boundary and refuses larger divergence without zero", () => {
    expect(
      resolveEpixPrices(cg(0.0001), osmo(0.00012), ["usd"], now)["usd"]
    ).toBe(0.00011);
    expect(
      resolveEpixPrices(cg(0.0001), osmo(0.000120001), ["usd"], now)["usd"]
    ).toBeUndefined();
  });

  it("uses a sole fresh source, never using USD as a different fiat", () => {
    expect(
      resolveEpixPrices(undefined, osmo(0.00007), ["usd", "eur"], now)
    ).toEqual({
      usd: 0.00007,
      [EPIX_PRICE_EXPIRY]: now + EPIX_PRICE_MAX_AGE_MS,
    });
    expect(resolveEpixPrices(cg(0.00007), undefined, ["usd"], now)["usd"]).toBe(
      0.00007
    );
  });

  it("rejects stale and future quotes independently", () => {
    const expired = now - EPIX_PRICE_MAX_AGE_MS;
    expect(
      resolveEpixPrices(cg(0.5, expired), osmo(0.00007), ["usd"], now)["usd"]
    ).toBe(0.00007);
    expect(
      resolveEpixPrices(cg(0.00007), osmo(0.5, expired), ["usd"], now)["usd"]
    ).toBe(0.00007);
    expect(
      resolveEpixPrices(cg(0.5, now + 61_000), undefined, ["usd"], now)
    ).toEqual({});
    expect(
      resolveEpixPrices(undefined, osmo(0.5, now + 61_000), ["usd"], now)
    ).toEqual({});
    expect(
      resolveEpixPrices(cg(0.5, expired), osmo(0.5, expired), ["usd"], now)
    ).toEqual({});
  });

  it.each([0, -1, NaN, Infinity, 1e-300, 1e308])(
    "rejects unusable quote %s without losing a healthy source",
    (invalid) => {
      expect(
        resolveEpixPrices(cg(invalid), osmo(0.00007), ["usd"], now)["usd"]
      ).toBe(0.00007);
      expect(
        resolveEpixPrices(cg(0.00007), osmo(invalid), ["usd"], now)["usd"]
      ).toBe(0.00007);
    }
  );

  it("validates the native bridge identity and exponent, not only its ticker", () => {
    for (const wrong of [
      { denom: "factory/other/allEPIX" },
      { exponent: 12 },
      { coingecko_id: "another-epix" },
    ]) {
      expect(
        resolveEpixPrices(undefined, osmo(0.00007, now, wrong), ["usd"], now)
      ).toEqual({});
    }
  });

  it("requires readable snapshot Date and respects cache Age", () => {
    const missingDate = osmo(0.00007);
    missingDate.headers.delete("date");
    expect(
      resolveEpixPrices(cg(0.00008), missingDate, ["usd"], now)["usd"]
    ).toBe(0.00008);
    const oldCache = osmo(0.00007);
    oldCache.headers.set("age", String(EPIX_PRICE_MAX_AGE_MS / 1000));
    expect(resolveEpixPrices(undefined, oldCache, ["usd"], now)).toEqual({});
    oldCache.headers.set("age", "invalid");
    expect(resolveEpixPrices(undefined, oldCache, ["usd"], now)).toEqual({});
  });

  it("fetches both sources, requests CG timestamps and preserves other assets", async () => {
    const fetch = jest.fn(async (url: string) =>
      url === OSMOSIS_EPIX_URL
        ? osmo(0.000072)
        : {
            ...cg(0.00007),
            data: { ...cg(0.00007).data, bitcoin: { usd: 60000 } },
          }
    );
    const result = await fetchEpixPrices(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,epix&vs_currencies=usd",
      new AbortController().signal,
      fetch,
      () => now
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain("include_last_updated_at=true");
    expect(result.data["bitcoin"]).toEqual({ usd: 60000 });
    expect(result.data["epix"]["usd"]).toBe(0.000071);
  });

  it.each(["cg", "osmo"])(
    "uses the other source after %s fails",
    async (failed) => {
      const fetch = jest.fn(async (url: string) => {
        if ((url === OSMOSIS_EPIX_URL) === (failed === "osmo"))
          throw new Error("offline");
        return url === OSMOSIS_EPIX_URL ? osmo(0.00007) : cg(0.00007);
      });
      const result = await fetchEpixPrices(
        "https://api.coingecko.com/api/v3/simple/price?ids=epix&vs_currencies=usd",
        new AbortController().signal,
        fetch,
        () => now
      );
      expect(result.data["epix"]["usd"]).toBe(0.00007);
    }
  );

  it("reports unavailable when both networks fail", async () => {
    await expect(
      fetchEpixPrices(
        "https://api.coingecko.com/api/v3/simple/price?ids=epix&vs_currencies=usd",
        new AbortController().signal,
        jest.fn().mockRejectedValue(new Error("offline")),
        () => now
      )
    ).rejects.toThrow("Price sources unavailable");
  });
});
