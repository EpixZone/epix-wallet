import { startWalletTransferScanner } from "./wallet-transfer-scanner";
import { BrowserQRCodeReader } from "@zxing/browser";
import {
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from "@zxing/library";

const mockDecodeFromVideoElement = jest.fn();
jest.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: jest.fn().mockImplementation(() => ({
    decodeFromVideoElement: mockDecodeFromVideoElement,
  })),
}));

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("wallet QR camera lifecycle", () => {
  const trackStop = jest.fn();
  const controlStop = jest.fn();
  const getCapabilities = jest.fn();
  const applyConstraints = jest.fn();
  const track = { stop: trackStop, getCapabilities, applyConstraints };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
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
    getCapabilities.mockReset().mockReturnValue({});
    applyConstraints.mockReset().mockResolvedValue(undefined);
    mockDecodeFromVideoElement
      .mockReset()
      .mockResolvedValue({ stop: controlStop });
  });

  it("prefers rear-camera detail, searches dense codes and stops after a valid scan", async () => {
    const onScan = jest.fn().mockReturnValue(true);
    startWalletTransferScanner(video, onScan, jest.fn());
    await flush();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    expect(BrowserQRCodeReader).toHaveBeenCalledWith(
      new Map([[DecodeHintType.TRY_HARDER, true]]),
      { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 250 }
    );
    mockDecodeFromVideoElement.mock.calls[0][1]({
      getText: () => "encrypted QR",
    });
    expect(onScan).toHaveBeenCalledWith("encrypted QR");
    expect(trackStop).toHaveBeenCalled();
    expect(controlStop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it("keeps scanning when the QR is unrelated", async () => {
    const stop = startWalletTransferScanner(video, () => false, jest.fn());
    await flush();
    mockDecodeFromVideoElement.mock.calls[0][1]({
      getText: () => "unrelated QR",
    });
    expect(trackStop).not.toHaveBeenCalled();
    stop();
    expect(trackStop).toHaveBeenCalled();
  });

  it("keeps ordinary ZXing detection misses silent", async () => {
    const onError = jest.fn();
    const onScan = jest.fn();
    const stop = startWalletTransferScanner(video, onScan, onError);
    await flush();
    const callback = mockDecodeFromVideoElement.mock.calls[0][1];
    for (const error of [
      new NotFoundException(),
      new ChecksumException(),
      new FormatException(),
    ]) {
      callback(undefined, error);
    }
    expect(onScan).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(trackStop).not.toHaveBeenCalled();
    stop();
  });

  it("reports a fatal decoder error once and ignores callbacks after cleanup", async () => {
    const onError = jest.fn();
    const onScan = jest.fn();
    const stop = startWalletTransferScanner(video, onScan, onError);
    await flush();
    const callback = mockDecodeFromVideoElement.mock.calls[0][1];
    callback(undefined, new Error("canvas unavailable"));
    callback(undefined, new Error("late failure"));
    callback({ getText: () => "late QR" });
    stop();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith();
    expect(onScan).not.toHaveBeenCalled();
    expect(controlStop).toHaveBeenCalledTimes(1);
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it("cleans up when the decoder fails before returning its controls", async () => {
    mockDecodeFromVideoElement.mockImplementation((_video, callback) => {
      callback(undefined, new Error("first frame failed"));
      return Promise.resolve({ stop: controlStop });
    });
    const onError = jest.fn();
    startWalletTransferScanner(video, jest.fn(), onError);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(controlStop).toHaveBeenCalledTimes(1);
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it("cleans up controls that arrive after cancellation during decoder startup", async () => {
    let resolveControls: (value: unknown) => void = () => undefined;
    mockDecodeFromVideoElement.mockImplementation(() => {
      return new Promise((resolve) => {
        resolveControls = resolve;
      });
    });
    const onError = jest.fn();
    const stop = startWalletTransferScanner(video, jest.fn(), onError);
    await flush();
    stop();
    expect(trackStop).toHaveBeenCalledTimes(1);
    resolveControls({ stop: controlStop });
    await flush();
    expect(controlStop).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps a replacement stream when old ZXing controls arrive on the same video", async () => {
    const { BrowserCodeReader, BrowserQRCodeReader: ActualReader } =
      jest.requireActual<typeof import("@zxing/browser")>("@zxing/browser");
    const reader = new ActualReader();
    const prepare = jest
      .spyOn(BrowserCodeReader, "prepareVideoElement")
      .mockReturnValue(video);
    // Delay the real library's playback wait, then use its actual decoder setup
    // and scan-finalizer contract so stream-owning controls cannot hide in a mock.
    let resolveFirstPlay: (value: boolean) => void = () => undefined;
    const play = jest
      .spyOn(
        BrowserCodeReader as unknown as {
          playVideoOnLoadAsync: () => Promise<boolean>;
        },
        "playVideoOnLoadAsync"
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirstPlay = resolve))
      )
      .mockResolvedValue(true);
    const decoderStops: jest.Mock[] = [];
    jest
      .spyOn(reader, "scan")
      .mockImplementation((_video, _callback, finalize) => {
        const stop = jest.fn(() => finalize?.());
        decoderStops.push(stop);
        return { stop };
      });
    mockDecodeFromVideoElement.mockImplementation((element, callback) =>
      reader.decodeFromVideoElement(element, callback)
    );
    const nextTrackStop = jest.fn();
    const nextTrack = { stop: nextTrackStop };
    const nextStream = {
      getTracks: () => [nextTrack],
      getVideoTracks: () => [nextTrack],
    };
    getUserMedia
      .mockResolvedValueOnce(stream)
      .mockResolvedValueOnce(nextStream);
    let stopNext: (() => void) | undefined;
    try {
      const stopFirst = startWalletTransferScanner(video, jest.fn(), jest.fn());
      await flush();
      stopFirst();
      const onScan = jest.fn().mockReturnValue(true);
      stopNext = startWalletTransferScanner(video, onScan, jest.fn());
      await flush();
      expect(video.srcObject).toBe(nextStream);
      resolveFirstPlay(true);
      await flush();
      expect(decoderStops[1]).toHaveBeenCalledTimes(1);
      expect(video.srcObject).toBe(nextStream);
      expect(nextTrackStop).not.toHaveBeenCalled();
      mockDecodeFromVideoElement.mock.calls[0][1]({
        getText: () => "stale QR",
      });
      expect(onScan).not.toHaveBeenCalled();
      mockDecodeFromVideoElement.mock.calls[1][1]({
        getText: () => "current QR",
      });
      expect(onScan).toHaveBeenCalledWith("current QR");
      expect(nextTrackStop).toHaveBeenCalledTimes(1);
      expect(video.srcObject).toBeNull();
    } finally {
      stopNext?.();
      prepare.mockRestore();
      play.mockRestore();
    }
  });

  it("uses continuous focus when the camera advertises it", async () => {
    getCapabilities.mockReturnValue({ focusMode: ["manual", "continuous"] });
    const stop = startWalletTransferScanner(video, jest.fn(), jest.fn());
    await flush();
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: "continuous" }],
    });
    expect(mockDecodeFromVideoElement).toHaveBeenCalled();
    stop();
  });

  it("continues scanning when optional focus control fails", async () => {
    getCapabilities.mockReturnValue({ focusMode: ["continuous"] });
    applyConstraints.mockRejectedValue(new Error("unsupported focus"));
    const onError = jest.fn();
    const stop = startWalletTransferScanner(video, jest.fn(), onError);
    await flush();
    expect(mockDecodeFromVideoElement).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it("does not start the decoder after cancellation while focus is pending", async () => {
    getCapabilities.mockReturnValue({ focusMode: ["continuous"] });
    let resolveFocus: () => void = () => undefined;
    applyConstraints.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFocus = resolve;
        })
    );
    const onError = jest.fn();
    const stop = startWalletTransferScanner(video, jest.fn(), onError);
    await flush();
    stop();
    resolveFocus();
    await flush();
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(mockDecodeFromVideoElement).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not require camera capability support", async () => {
    getCapabilities.mockImplementation(() => {
      throw new Error("camera capabilities unavailable");
    });
    const stop = startWalletTransferScanner(video, jest.fn(), jest.fn());
    await flush();
    expect(applyConstraints).not.toHaveBeenCalled();
    expect(mockDecodeFromVideoElement).toHaveBeenCalled();
    stop();
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
    expect(mockDecodeFromVideoElement).not.toHaveBeenCalled();
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
