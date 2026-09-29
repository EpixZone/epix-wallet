import { startWalletTransferScanner } from "./wallet-transfer-scanner";

const mockDecodeFromStream = jest.fn();
jest.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: jest.fn().mockImplementation(() => ({
    decodeFromStream: mockDecodeFromStream,
  })),
}));

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("wallet QR camera lifecycle", () => {
  const trackStop = jest.fn();
  const controlStop = jest.fn();
  const stream = { getTracks: () => [{ stop: trackStop }] };
  const getUserMedia = jest.fn();
  let video: HTMLVideoElement;

  beforeEach(() => {
    jest.clearAllMocks();
    video = { srcObject: null } as HTMLVideoElement;
    Object.defineProperty(globalThis, "navigator", {
      value: { mediaDevices: { getUserMedia } },
      configurable: true,
    });
    getUserMedia.mockResolvedValue(stream);
    mockDecodeFromStream.mockResolvedValue({ stop: controlStop });
  });

  it("requests the rear camera without audio and stops tracks after a valid scan", async () => {
    const onScan = jest.fn().mockReturnValue(true);
    startWalletTransferScanner(video, onScan, jest.fn());
    await flush();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    mockDecodeFromStream.mock.calls[0][2]({ getText: () => "encrypted QR" });
    expect(onScan).toHaveBeenCalledWith("encrypted QR");
    expect(trackStop).toHaveBeenCalled();
    expect(controlStop).toHaveBeenCalled();
  });

  it("keeps scanning when the QR is unrelated", async () => {
    const stop = startWalletTransferScanner(video, () => false, jest.fn());
    await flush();
    mockDecodeFromStream.mock.calls[0][2]({ getText: () => "unrelated QR" });
    expect(trackStop).not.toHaveBeenCalled();
    stop();
    expect(trackStop).toHaveBeenCalled();
  });

  it("stops a camera permission request that resolves after navigation", async () => {
    let resolvePermission: (value: unknown) => void = () => undefined;
    getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        })
    );
    const onScan = jest.fn();
    const stop = startWalletTransferScanner(video, onScan, jest.fn());
    stop();
    resolvePermission(stream);
    await flush();
    expect(trackStop).toHaveBeenCalled();
    expect(mockDecodeFromStream).not.toHaveBeenCalled();
    expect(onScan).not.toHaveBeenCalled();
  });

  it("reports permission denial without exposing scan contents", async () => {
    getUserMedia.mockRejectedValue(new Error("permission denied"));
    const onError = jest.fn();
    startWalletTransferScanner(video, jest.fn(), onError);
    await flush();
    expect(onError).toHaveBeenCalledWith();
  });
});
