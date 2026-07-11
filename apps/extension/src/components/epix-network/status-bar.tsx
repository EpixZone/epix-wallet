import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import styled, { useTheme } from "styled-components";
import { Box } from "../box";
import { Modal } from "../modal";
import { Caption2, Subtitle4 } from "../typography";
import { ColorPalette } from "../../styles";
import { isMobileShell } from "../../utils";
import { EpixNetworkPanel } from "./panel";
import {
  useEpixStatus,
  torColor,
  i2pColor,
  i2pOn,
  EpixStatus,
} from "./use-epix-status";

/**
 * Height of the always-visible network status strip. Exported so layouts that
 * pin it under a fixed header can pad their content by the same amount.
 */
export const EpixStatusBarHeight = "2rem";

// The bar shows one short word per network; the panel keeps the longer
// sentences. Ids resolve against the same page.setting.epix.* family.
function torTextId(status: EpixStatus | null, torClearnet: boolean): string {
  if (!status) return "page.setting.epix.tor.unknown";
  if (status.tor_enabled && torClearnet) return "page.setting.epix.bar.routed";
  if (status.tor_enabled) return "page.setting.epix.tor.ready";
  if (status.tor_status === "Bootstrapping")
    return "page.setting.epix.tor.connecting";
  return "page.setting.epix.tor.off";
}

function i2pTextId(status: EpixStatus | null): string {
  if (!status) return "page.setting.epix.i2p.unknown";
  if (!i2pOn(status)) return "page.setting.epix.i2p.off";
  if (status.i2p_enabled || (status.i2p_status || "").startsWith("Ready"))
    return "page.setting.epix.i2p.ready";
  if ((status.i2p_status || "").startsWith("Failed"))
    return "page.setting.epix.i2p.failed";
  return "page.setting.epix.i2p.connecting";
}

/**
 * The always-visible Tor / I2P strip shown at the top of the unlock, register
 * and main-wallet screens, replacing the old click-to-see shield. One glance
 * gives both networks' state through the shared status color language (gray
 * off, amber connecting, purple ready, green routed); tapping anywhere on the
 * strip opens the full Epix Network panel with addresses and controls.
 * Renders nothing when the desktop native host is absent, so shells without
 * the node never show a dead strip.
 */
export const EpixNetworkStatusBar: FunctionComponent<{
  // Panel style override. Defaults to "inline" on the mobile shells (their
  // WebViews position the bottom-sheet Modal unreliably) and "bottom" on
  // desktop. The register page forces "inline" for the same reason the old
  // shield did: its fixed layout-width viewport breaks the Modal portal.
  panelMode?: "bottom" | "inline";
  // Constrain the bar's content to a centered column. Used where the strip
  // spans a full browser tab (register): without it the two networks hug the
  // far left and the chevron the far right of a wide window.
  centered?: boolean;
}> = observer(({ panelMode, centered }) => {
  const intl = useIntl();
  const theme = useTheme();
  const isLight = theme.mode === "light";

  const { available, status, torClearnet } = useEpixStatus();
  const [isOpen, setIsOpen] = useState(false);

  if (!available) {
    return null;
  }

  const mode = panelMode ?? (isMobileShell() ? "inline" : "bottom");
  const toggle = () => setIsOpen((v) => (mode === "inline" ? !v : true));

  const labelColor = isLight
    ? ColorPalette["gray-500"]
    : ColorPalette["gray-50"];
  const stateColor = isLight
    ? ColorPalette["gray-300"]
    : ColorPalette["gray-200"];

  return (
    <Styles.Bar
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <Styles.Inner centered={centered}>
        <Styles.Segment>
          <Box
            width="1.125rem"
            height="1.125rem"
            alignX="center"
            alignY="center"
          >
            <TorIcon color={torColor(status, torClearnet)} />
          </Box>
          <Subtitle4 color={labelColor}>
            {intl.formatMessage({ id: "page.setting.epix.tor" })}
          </Subtitle4>
          <Caption2 color={stateColor}>
            {intl.formatMessage({ id: torTextId(status, torClearnet) })}
          </Caption2>
        </Styles.Segment>

        <Styles.Segment>
          <Box
            width="1.125rem"
            height="1.125rem"
            alignX="center"
            alignY="center"
          >
            <I2pIcon color={i2pColor(status)} />
          </Box>
          <Subtitle4 color={labelColor}>
            {intl.formatMessage({ id: "page.setting.epix.i2p" })}
          </Subtitle4>
          <Caption2 color={stateColor}>
            {intl.formatMessage({ id: i2pTextId(status) })}
          </Caption2>
        </Styles.Segment>

        <Styles.Spacer />

        <Styles.Chev rotated={mode === "inline" && isOpen}>
          <ChevronDownIcon color={ColorPalette["gray-300"]} />
        </Styles.Chev>

        {mode === "inline" && isOpen ? (
          <React.Fragment>
            {/* Tap-away backdrop to close the popover. */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100,
                cursor: "default",
              }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: `calc(${EpixStatusBarHeight} + 0.5rem)`,
                right: "0.75rem",
                width: "22rem",
                maxWidth: "calc(100vw - 1.5rem)",
                maxHeight: "80vh",
                overflowY: "auto",
                zIndex: 101,
                borderRadius: "1.25rem",
                boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
                cursor: "default",
              }}
            >
              <EpixNetworkPanel onClose={() => setIsOpen(false)} rounded />
            </div>
          </React.Fragment>
        ) : null}
      </Styles.Inner>

      {mode === "bottom" ? (
        <Modal isOpen={isOpen} align="bottom" close={() => setIsOpen(false)}>
          <EpixNetworkPanel onClose={() => setIsOpen(false)} />
        </Modal>
      ) : null}
    </Styles.Bar>
  );
});

const Styles = {
  Bar: styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;

    height: ${EpixStatusBarHeight};

    cursor: pointer;

    background: ${(props) =>
      props.theme.mode === "light"
        ? ColorPalette["light-background"]
        : ColorPalette["gray-700"]};

    border-bottom-width: 0.5px;
    border-bottom-style: solid;
    border-bottom-color: ${(props) =>
      props.theme.mode === "light"
        ? ColorPalette["gray-100"]
        : ColorPalette["gray-500"]};

    &:hover {
      background: ${(props) =>
        props.theme.mode === "light"
          ? ColorPalette["gray-10"]
          : ColorPalette["gray-650"]};
    }

    &:focus-visible {
      outline: 1px solid ${ColorPalette["purple-400"]};
      outline-offset: -1px;
    }
  `,

  // The popover anchors here so it opens next to the content, not at the far
  // edge of a wide window when the bar is centered.
  Inner: styled.div<{ centered?: boolean }>`
    position: relative;

    display: flex;
    flex-direction: row;
    align-items: center;
    column-gap: 1.25rem;

    width: 100%;
    max-width: ${(props) => (props.centered ? "26rem" : "none")};
    padding: 0 1rem;
  `,

  Segment: styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    column-gap: 0.375rem;

    white-space: nowrap;
  `,

  Spacer: styled.div`
    flex: 1;
  `,

  Chev: styled.div<{ rotated?: boolean }>`
    display: flex;
    align-items: center;

    transform: rotate(${(props) => (props.rotated ? "180deg" : "0deg")});
    transition: transform 150ms ease;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
};

/**
 * Minimal line-drawn onion for Tor: the body circle with two inner layers and
 * a small stem, stroked in the current status color. Stroke weight 2/24 so
 * the color reads at the bar's 1.125rem render size; no fills, no gradients.
 */
const TorIcon: FunctionComponent<{ color: string }> = ({ color }) => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 3.5c1.1.8 1.5 1.9 1.1 3.1"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="14" r="6.5" stroke={color} strokeWidth="2" />
    <path
      d="M12 7.5c-2.2 1.6-3.3 3.7-3.3 6.5 0 2.7 1.1 4.9 3.3 6.5"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M12 7.5c2.2 1.6 3.3 3.7 3.3 6.5 0 2.7-1.1 4.9-3.3 6.5"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Minimal nested-tunnel glyph for I2P (garlic routing rides through tunnels):
 * two arches over a baseline, echoing the onion's layered look so the pair
 * reads as one family.
 */
const I2pIcon: FunctionComponent<{ color: string }> = ({ color }) => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4.5 19.5v-6.5a7.5 7.5 0 0 1 15 0v6.5"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 19.5v-6a3 3 0 0 1 6 0v6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M3 19.5h18" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ChevronDownIcon: FunctionComponent<{ color: string }> = ({ color }) => (
  <svg
    width="0.875rem"
    height="0.875rem"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3.33 5.67 8 10.33l4.67-4.66"
      stroke={color}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
