import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import {
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from "@zxing/library";

function isDetectionMiss(error: unknown): boolean {
  return (
    error instanceof NotFoundException ||
    error instanceof ChecksumException ||
    error instanceof FormatException
  );
}

// Keep the native frame first. A single alternate sample recovers dense codes
// whose module edges fall poorly on the camera's pixel grid.
function installSamplingRetry(reader: BrowserQRCodeReader): () => void {
  const decode = reader.decodeFromCanvas.bind(reader);
  let disposed = false;
  let canvas: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | undefined;
  reader.decodeFromCanvas = (frame) => {
    if (disposed) throw new NotFoundException();
    try {
      return decode(frame);
    } catch (error) {
      if (!isDetectionMiss(error)) throw error;
      const width = Math.round(frame.width * 1.25);
      const height = Math.round(frame.height * 1.25);
      // Bound the extra allocation without changing the exact retry scale.
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        width > 2560 ||
        height > 2560 ||
        width * height > 4_000_000
      ) {
        throw error;
      }
      if (!canvas) canvas = document.createElement("canvas");
      // Shrink first so rotation cannot allocate an oversized intermediate.
      if (canvas.width > width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      if (canvas.width !== width) canvas.width = width;
      if (!context) {
        context = canvas.getContext("2d") ?? undefined;
        if (!context) throw new Error("QR sampling canvas unavailable");
      }
      context.clearRect(0, 0, width, height);
      // Canvas resizing resets drawing state, so apply this for every sample.
      context.imageSmoothingEnabled = false;
      context.drawImage(frame, 0, 0, width, height);
      return decode(canvas);
    }
  };
  return () => {
    if (disposed) return;
    disposed = true;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    canvas = undefined;
    context = undefined;
  };
}

async function preferContinuousFocus(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    const capabilities = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { focusMode?: string[] })
      | undefined;
    if (capabilities?.focusMode?.includes("continuous")) {
      const focus: MediaTrackConstraintSet & { focusMode: string } = {
        focusMode: "continuous",
      };
      await track.applyConstraints({ advanced: [focus] });
    }
  } catch {
    // Focus control is optional and unavailable on some Android cameras.
  }
}

// Return cleanup immediately, even while Android's permission dialog is open.
export function startWalletTransferScanner(
  video: HTMLVideoElement,
  onScan: (text: string) => boolean,
  onError: () => void
): () => void {
  let stopped = false;
  let stream: MediaStream | undefined;
  let controls: IScannerControls | undefined;
  let disposeSampling: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    disposeSampling?.();
    disposeSampling = undefined;
    const activeControls = controls;
    controls = undefined;
    activeControls?.stop();
    const activeStream = stream;
    stream = undefined;
    activeStream?.getTracks().forEach((track) => track.stop());
    if (video.srcObject === activeStream) video.srcObject = null;
  };
  const fail = () => {
    if (stopped) return;
    stop();
    onError();
  };

  (async () => {
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    stream = cameraStream;
    if (stopped) {
      stop();
      return;
    }
    await preferContinuousFocus(cameraStream);
    if (stopped) return;
    const reader = new BrowserQRCodeReader(
      new Map([[DecodeHintType.TRY_HARDER, true]]),
      // Retry as focus settles without decoding every camera frame.
      { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 250 }
    );
    disposeSampling = installSamplingRetry(reader);
    // Own the stream lifecycle: decodeFromStream would let late ZXing controls
    // clear a newer scanner's source when this video element is reused.
    video.srcObject = cameraStream;
    controls = await reader.decodeFromVideoElement(video, (result, error) => {
      if (stopped) return;
      if (error) {
        // ZXing retries these ordinary misses itself. Other errors terminate
        // its scan loop, so make that failure visible instead of staying busy.
        if (!isDetectionMiss(error)) fail();
        return;
      }
      if (result && onScan(result.getText())) stop();
    });
    if (stopped) stop();
  })().catch(fail);
  return stop;
}
