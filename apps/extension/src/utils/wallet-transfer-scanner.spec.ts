import { startWalletTransferScanner } from "./wallet-transfer-scanner";
import { BrowserQRCodeReader } from "@zxing/browser";
import {
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from "@zxing/library";

const mockDecodeFromVideoElement = jest.fn();
const mockDecodeFromCanvas = jest.fn();
jest.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: jest.fn().mockImplementation(() => ({
    decodeFromVideoElement: mockDecodeFromVideoElement,
    decodeFromCanvas: mockDecodeFromCanvas,
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
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const createElement = jest.fn();
  const context = {
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    imageSmoothingEnabled: true,
  };
  const getContext = jest.fn();
  let fallbackCanvas: HTMLCanvasElement;
  let widthWrites: number[];
  let heightWrites: number[];
  let allocationSizes: number[];
  let video: HTMLVideoElement;

  const frame = (width = 1280, height = 720) =>
    ({ width, height } as HTMLCanvasElement);
  const readerAt = (index = 0): BrowserQRCodeReader =>
    (BrowserQRCodeReader as unknown as jest.Mock).mock.results[index].value;
  // Match ZXing's synchronous frame-to-callback contract without a camera.
  const scanFrame = (canvas: HTMLCanvasElement, index = 0) => {
    const callback = mockDecodeFromVideoElement.mock.calls[index][1];
    try {
      callback(readerAt(index).decodeFromCanvas(canvas));
    } catch (error) {
      callback(undefined, error);
    }
  };

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
    mockDecodeFromCanvas.mockReset().mockImplementation(() => {
      throw new NotFoundException();
    });
    let width = 0;
    let height = 0;
    widthWrites = [];
    heightWrites = [];
    allocationSizes = [];
    fallbackCanvas = {
      get width() {
        return width;
      },
      set width(value: number) {
        width = value;
        widthWrites.push(value);
        allocationSizes.push(width * height);
        context.imageSmoothingEnabled = true;
      },
      get height() {
        return height;
      },
      set height(value: number) {
        height = value;
        heightWrites.push(value);
        allocationSizes.push(width * height);
        context.imageSmoothingEnabled = true;
      },
      getContext,
    } as unknown as HTMLCanvasElement;
    context.clearRect.mockReset();
    context.drawImage.mockReset();
    getContext.mockReset().mockReturnValue(context);
    createElement.mockReset().mockReturnValue(fallbackCanvas);
    Object.defineProperty(globalThis, "document", {
      value: { createElement },
      configurable: true,
    });
    mockDecodeFromVideoElement
      .mockReset()
      .mockResolvedValue({ stop: controlStop });
  });

  afterEach(() => {
    if (originalDocument) {
      Object.defineProperty(globalThis, "document", originalDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
  });

  it.each([true, false])(
    "uses native success without another sample (accepted: %s)",
    async (accepted) => {
      const result = {
        getText: () => (accepted ? "transfer" : "unrelated QR"),
      };
      mockDecodeFromCanvas.mockReturnValue(result);
      const onScan = jest.fn().mockReturnValue(accepted);
      const stop = startWalletTransferScanner(video, onScan, jest.fn());
      await flush();
      const native = frame();
      scanFrame(native);
      expect(mockDecodeFromCanvas).toHaveBeenCalledTimes(1);
      expect(mockDecodeFromCanvas).toHaveBeenCalledWith(native);
      expect(createElement).not.toHaveBeenCalled();
      expect(onScan).toHaveBeenCalledWith(result.getText());
      expect(trackStop).toHaveBeenCalledTimes(accepted ? 1 : 0);
      stop();
    }
  );

  it.each([NotFoundException, FormatException, ChecksumException])(
    "recovers an ordinary %p miss with one nearest-neighbor sample",
    async (Miss) => {
      const onScan = jest.fn().mockReturnValue(true);
      const onError = jest.fn();
      mockDecodeFromCanvas
        .mockImplementationOnce(() => {
          throw new Miss();
        })
        .mockReturnValueOnce({ getText: () => "transfer" });
      let smoothingAtDraw: boolean | undefined;
      context.drawImage.mockImplementation(() => {
        smoothingAtDraw = context.imageSmoothingEnabled;
      });
      startWalletTransferScanner(video, onScan, onError);
      await flush();
      const native = frame();
      scanFrame(native);
      expect(mockDecodeFromCanvas.mock.calls.map(([canvas]) => canvas)).toEqual(
        [native, fallbackCanvas]
      );
      expect(createElement).toHaveBeenCalledWith("canvas");
      expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1600, 900);
      expect(context.drawImage).toHaveBeenCalledWith(native, 0, 0, 1600, 900);
      expect(smoothingAtDraw).toBe(false);
      expect(onScan).toHaveBeenCalledTimes(1);
      expect(onScan).toHaveBeenCalledWith("transfer");
      expect(onError).not.toHaveBeenCalled();
      expect(trackStop).toHaveBeenCalledTimes(1);
      expect(controlStop).toHaveBeenCalledTimes(1);
      expect([fallbackCanvas.width, fallbackCanvas.height]).toEqual([0, 0]);
    }
  );

  it("keeps two ordinary misses silent without scheduling its own retry", async () => {
    const onScan = jest.fn();
    const onError = jest.fn();
    mockDecodeFromCanvas
      .mockImplementationOnce(() => {
        throw new NotFoundException();
      })
      .mockImplementationOnce(() => {
        throw new FormatException();
      });
    const stop = startWalletTransferScanner(video, onScan, onError);
    await flush();
    scanFrame(frame());
    await flush();
    expect(mockDecodeFromCanvas).toHaveBeenCalledTimes(2);
    expect(onScan).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(trackStop).not.toHaveBeenCalled();
    stop();
  });

  it.each(["native", "fallback", "context", "drawing"])(
    "reports a fatal %s failure once and disposes resources",
    async (stage) => {
      const fatal = new Error("decoder unavailable");
      if (stage === "native") {
        mockDecodeFromCanvas.mockImplementation(() => {
          throw fatal;
        });
      } else if (stage === "fallback") {
        mockDecodeFromCanvas
          .mockImplementationOnce(() => {
            throw new NotFoundException();
          })
          .mockImplementationOnce(() => {
            throw fatal;
          });
      } else if (stage === "context") {
        getContext.mockReturnValue(null);
      } else {
        context.drawImage.mockImplementation(() => {
          throw fatal;
        });
      }
      const onError = jest.fn();
      const onScan = jest.fn();
      const stop = startWalletTransferScanner(video, onScan, onError);
      await flush();
      scanFrame(frame());
      scanFrame(frame());
      mockDecodeFromVideoElement.mock.calls[0][1]({ getText: () => "late QR" });
      stop();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onScan).not.toHaveBeenCalled();
      expect(mockDecodeFromCanvas).toHaveBeenCalledTimes(
        stage === "fallback" ? 2 : 1
      );
      expect(createElement).toHaveBeenCalledTimes(stage === "native" ? 0 : 1);
      expect(trackStop).toHaveBeenCalledTimes(1);
      expect(controlStop).toHaveBeenCalledTimes(1);
      expect(video.srcObject).toBeNull();
      expect([fallbackCanvas.width, fallbackCanvas.height]).toEqual([0, 0]);
    }
  );

  it.each([
    [1920, 1080, 2400, 1350],
    [1080, 1920, 1350, 2400],
    [2048, 720, 2560, 900],
    [1600, 1600, 2000, 2000],
  ])(
    "admits bounded %s x %s camera frames",
    async (width, height, scaledWidth, scaledHeight) => {
      const stop = startWalletTransferScanner(video, jest.fn(), jest.fn());
      await flush();
      const native = frame(width, height);
      expect(() => readerAt().decodeFromCanvas(native)).toThrow(
        NotFoundException
      );
      expect(context.drawImage).toHaveBeenCalledWith(
        native,
        0,
        0,
        scaledWidth,
        scaledHeight
      );
      stop();
    }
  );

  it.each([
    [0, 720],
    [1280, 0],
    [-1, 720],
    [NaN, 720],
    [Infinity, 720],
    [1280, Infinity],
    [2049, 720],
    [720, 2049],
    [1601, 1600],
  ])(
    "skips extra allocation for unsupported %s x %s frames",
    async (width, height) => {
      const miss = new ChecksumException();
      mockDecodeFromCanvas.mockImplementation(() => {
        throw miss;
      });
      const stop = startWalletTransferScanner(video, jest.fn(), jest.fn());
      await flush();
      let thrown: unknown;
      try {
        readerAt().decodeFromCanvas(frame(width, height));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(miss);
      expect(mockDecodeFromCanvas).toHaveBeenCalledTimes(1);
      expect(createElement).not.toHaveBeenCalled();
      expect(context.drawImage).not.toHaveBeenCalled();
      stop();
    }
  );

  it("reuses its canvas, reapplies nearest sampling after resize, and disposes once", async () => {
    const smoothing: boolean[] = [];
    context.drawImage.mockImplementation(() => {
      smoothing.push(context.imageSmoothingEnabled);
    });
    const stop = startWalletTransferScanner(video, jest.fn(), jest.fn());
    await flush();
    for (const native of [frame(), frame(), frame(720, 1280)]) {
      expect(() => readerAt().decodeFromCanvas(native)).toThrow(
        NotFoundException
      );
    }
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(widthWrites).toEqual([1600, 900]);
    expect(heightWrites).toEqual([900, 1600]);
    expect(context.clearRect).toHaveBeenCalledTimes(3);
    expect(smoothing).toEqual([false, false, false]);
    stop();
    stop();
    expect(widthWrites).toEqual([1600, 900, 0]);
    expect(heightWrites).toEqual([900, 1600, 0]);
    expect(() => readerAt().decodeFromCanvas(frame())).toThrow(
      NotFoundException
    );
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(mockDecodeFromCanvas).toHaveBeenCalledTimes(6);
    expect(context.drawImage).toHaveBeenCalledTimes(3);
  });

  it("keeps intermediate allocations bounded when HD frames rotate", async () => {
    const stop = startWalletTransferScanner(video, jest.fn(), jest.fn());
    await flush();
    for (const native of [
      frame(1920, 1080),
      frame(1080, 1920),
      frame(1920, 1080),
    ]) {
      expect(() => readerAt().decodeFromCanvas(native)).toThrow(
        NotFoundException
      );
    }
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(Math.max(...allocationSizes)).toBeLessThanOrEqual(4_000_000);
    expect([fallbackCanvas.width, fallbackCanvas.height]).toEqual([2400, 1350]);
    stop();
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
      expect(() => readerAt().decodeFromCanvas(frame())).toThrow(
        NotFoundException
      );
      expect([fallbackCanvas.width, fallbackCanvas.height]).toEqual([
        1600, 900,
      ]);
      stopFirst();
      expect([fallbackCanvas.width, fallbackCanvas.height]).toEqual([0, 0]);
      const onScan = jest.fn().mockReturnValue(true);
      stopNext = startWalletTransferScanner(video, onScan, jest.fn());
      await flush();
      expect(video.srcObject).toBe(nextStream);
      resolveFirstPlay(true);
      await flush();
      expect(decoderStops[1]).toHaveBeenCalledTimes(1);
      expect(video.srcObject).toBe(nextStream);
      expect(nextTrackStop).not.toHaveBeenCalled();
      expect(() => readerAt().decodeFromCanvas(frame())).toThrow(
        NotFoundException
      );
      expect(mockDecodeFromCanvas).toHaveBeenCalledTimes(2);
      expect(createElement).toHaveBeenCalledTimes(1);
      mockDecodeFromVideoElement.mock.calls[0][1]({
        getText: () => "stale QR",
      });
      expect(onScan).not.toHaveBeenCalled();
      mockDecodeFromCanvas.mockReturnValueOnce({
        getText: () => "current QR",
      });
      scanFrame(frame(), 1);
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
    expect(createElement).not.toHaveBeenCalled();
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
    expect(createElement).not.toHaveBeenCalled();
  });

  it("reports permission denial without exposing scan contents", async () => {
    getUserMedia.mockRejectedValue(new Error("permission denied"));
    const onError = jest.fn();
    startWalletTransferScanner(video, jest.fn(), onError);
    await flush();
    expect(onError).toHaveBeenCalledWith();
  });
});
