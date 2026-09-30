import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";

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
    controls?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };

  (async () => {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    if (stopped) {
      stop();
      return;
    }
    const reader = new BrowserQRCodeReader();
    controls = await reader.decodeFromStream(stream, video, (result) => {
      if (!stopped && result && onScan(result.getText())) stop();
    });
    if (stopped) stop();
  })().catch(() => {
    const report = !stopped;
    stop();
    if (report) onError();
  });
  return stop;
}
