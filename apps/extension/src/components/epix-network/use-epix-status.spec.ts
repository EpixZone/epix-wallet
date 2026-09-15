// Exercise the shared status store without mounting a DOM. Rendering and the
// interval lifecycle are independent of these request ordering regressions.
jest.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: jest.fn(),
  useReducer: () => [0, jest.fn()],
}));

describe("Epix status routing changes", () => {
  let useEpixStatus: typeof import("./use-epix-status").useEpixStatus;
  let sendMessage: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    sendMessage = jest.fn();
    (globalThis as any).browser = { runtime: { sendMessage } };
    ({ useEpixStatus } = await import("./use-epix-status"));
  });

  afterEach(() => {
    delete (globalThis as any).browser;
  });

  it("keeps the selected route when a status poll completes before the toggle", async () => {
    let finishToggle!: (result: object) => void;
    sendMessage.mockImplementation((message) =>
      message.type === "epix-status"
        ? Promise.resolve({ ok: true, status: { tor_clearnet: true } })
        : new Promise((resolve) => (finishToggle = resolve))
    );
    const pending = useEpixStatus().setTorClearnet(false);
    await useEpixStatus().refresh();
    expect(useEpixStatus().torClearnet).toBe(false);
    finishToggle({ ok: true });
    await pending;
    expect(useEpixStatus().torClearnet).toBe(false);
  });

  it("restores the actual previous value when a same-value change fails", async () => {
    sendMessage.mockResolvedValueOnce({
      ok: true,
      status: { tor_clearnet: false },
    });
    await useEpixStatus().refresh();
    sendMessage.mockResolvedValueOnce({ ok: false, error: "host unavailable" });
    await useEpixStatus().setTorClearnet(false);
    expect(useEpixStatus().torClearnet).toBe(false);
  });

  it("serializes rapid toggles and restores the last confirmed route on failure", async () => {
    let finishFirst!: (result: object) => void;
    sendMessage
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve))
      )
      .mockResolvedValueOnce({ ok: false, error: "host unavailable" });
    const first = useEpixStatus().setTorClearnet(false);
    const second = useEpixStatus().setTorClearnet(true);
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    finishFirst({ ok: true });
    await Promise.all([first, second]);
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: "epix-set-tor-clearnet",
      on: true,
    });
    expect(useEpixStatus().torClearnet).toBe(false);
  });
});
