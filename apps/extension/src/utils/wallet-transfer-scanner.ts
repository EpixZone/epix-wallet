import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import {
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from "@zxing/library";

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
  const stop = () => {
    stopped = true;
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
    // Own the stream lifecycle: decodeFromStream would let late ZXing controls
    // clear a newer scanner's source when this video element is reused.
    video.srcObject = cameraStream;
    controls = await reader.decodeFromVideoElement(video, (result, error) => {
      if (stopped) return;
      if (error) {
        // ZXing retries these ordinary misses itself. Other errors terminate
        // its scan loop, so make that failure visible instead of staying busy.
        if (
          !(error instanceof NotFoundException) &&
          !(error instanceof ChecksumException) &&
          !(error instanceof FormatException)
        ) {
          fail();
        }
        return;
      }
      if (result && onScan(result.getText())) stop();
    });
    if (stopped) stop();
  })().catch(fail);
  return stop;
}
