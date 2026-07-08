import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { Box } from "../box";
import { Modal } from "../modal";
import { EpixNetworkPanel } from "./panel";
import { useEpixStatus, shieldColor } from "./use-epix-status";

/**
 * A single shield in the header whose color reflects the overall Tor + I2P
 * privacy posture (green routed, purple ready, amber connecting, gray off).
 * Tapping it opens the Epix Network panel. Hidden entirely when the desktop
 * native host isn't present (e.g. a non-Firefox shell), so it never shows a
 * dead control.
 */
// Whether we run inside one of the mobile shells (Android GeckoView, iOS
// WKWebView) rather than desktop Firefox. The bottom-sheet Modal is a portal
// with a viewport-fixed root that does not position reliably inside those
// WebViews (it broke outright on the register page's fixed layout-width
// viewport), so on mobile the shield opens an inline popover anchored under
// the icon instead. Detected by the user agent - both mobile engines report
// Android/iOS + "Mobile", desktop Firefox does not.
const isMobileShell = (): boolean =>
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const EpixNetworkShield: FunctionComponent<{
  size?: string;
  // Panel style override. Defaults to "inline" on the mobile shells and
  // "bottom" (a bottom-sheet Modal) on desktop.
  panelMode?: "bottom" | "inline";
}> = observer(({ size = "1.5rem", panelMode }) => {
  const { available, status, torClearnet } = useEpixStatus();
  const [isOpen, setIsOpen] = useState(false);

  if (!available) {
    return null;
  }

  const mode = panelMode ?? (isMobileShell() ? "inline" : "bottom");
  const color = shieldColor(status, torClearnet);

  const shieldButton = (
    <Box
      cursor="pointer"
      onClick={() => setIsOpen((v) => (mode === "inline" ? !v : true))}
      // A comfortable tap target around the small glyph - the icon itself is
      // `size`, but the clickable area is padded so it is easy to hit on a
      // phone (the glyph sits near the screen edge).
      minWidth="2.75rem"
      minHeight="2.75rem"
      alignX="center"
      alignY="center"
    >
      <Box width={size} height={size} alignX="center" alignY="center">
        <ShieldIcon color={color} />
      </Box>
    </Box>
  );

  if (mode === "inline") {
    return (
      <div style={{ position: "relative" }}>
        {shieldButton}
        {isOpen ? (
          <React.Fragment>
            {/* Tap-away backdrop to close the popover. */}
            <div
              onClick={() => setIsOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 0.5rem)",
                right: 0,
                width: "22rem",
                maxWidth: "90vw",
                maxHeight: "80vh",
                overflowY: "auto",
                zIndex: 101,
                borderRadius: "1.25rem",
                boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              }}
            >
              <EpixNetworkPanel onClose={() => setIsOpen(false)} rounded />
            </div>
          </React.Fragment>
        ) : null}
      </div>
    );
  }

  return (
    <React.Fragment>
      {shieldButton}

      <Modal isOpen={isOpen} align="bottom" close={() => setIsOpen(false)}>
        <EpixNetworkPanel onClose={() => setIsOpen(false)} />
      </Modal>
    </React.Fragment>
  );
});

const ShieldIcon: FunctionComponent<{ color: string }> = ({ color }) => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 3l7 2.5v5.5c0 4.5-2.9 7.9-7 9.5-4.1-1.6-7-5-7-9.5V5.5L12 3z"
      fill={color}
      fillOpacity="0.18"
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M12 7.5v9M7.5 11h9"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);
