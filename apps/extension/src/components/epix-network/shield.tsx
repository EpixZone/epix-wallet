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
export const EpixNetworkShield: FunctionComponent<{ size?: string }> = observer(
  ({ size = "1.5rem" }) => {
    const { available, status, torClearnet } = useEpixStatus();
    const [isOpen, setIsOpen] = useState(false);

    if (!available) {
      return null;
    }

    const color = shieldColor(status, torClearnet);

    return (
      <React.Fragment>
        <Box
          cursor="pointer"
          onClick={() => setIsOpen(true)}
          width={size}
          height={size}
          alignX="center"
          alignY="center"
        >
          <ShieldIcon color={color} />
        </Box>

        <Modal isOpen={isOpen} align="bottom" close={() => setIsOpen(false)}>
          <EpixNetworkPanel onClose={() => setIsOpen(false)} />
        </Modal>
      </React.Fragment>
    );
  }
);

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
