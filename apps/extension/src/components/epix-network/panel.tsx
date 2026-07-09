import React, { FunctionComponent } from "react";
import { useIntl } from "react-intl";
import { useTheme } from "styled-components";
import { Box } from "../box";
import { Stack } from "../stack";
import { Column, Columns } from "../column";
import { Body2, Body3, Subtitle2, Subtitle3 } from "../typography";
import { Toggle } from "../toggle";
import { Gutter } from "../gutter";
import { ColorPalette } from "../../styles";
import { useEpixStatus, torColor, i2pColor, i2pOn } from "./use-epix-status";

const StatusDot: FunctionComponent<{ color: string }> = ({ color }) => (
  <Box
    width="0.625rem"
    height="0.625rem"
    borderRadius="50%"
    backgroundColor={color}
  />
);

// The node dashboard's configuration page, where the deeper Tor / I2P (and all
// other node) settings live. Opened in a new browser tab from the panel.
const DASHBOARD_CONFIG_URL = "https://dashboard.epix/Config";

async function openDashboardConfig(): Promise<void> {
  const runtime: any = (globalThis as any).browser;
  // On the mobile shells there is one browser view plus the wallet sheet, and
  // `.epix` names only resolve in the browser view - so opening the config in
  // a wallet "tab" would go nowhere. Ask the host app instead (routed through
  // the background, since native messaging is background-only): it closes the
  // wallet and points the browser at the node's config page. The desktop
  // native host does not implement it and answers not-ok, so we fall back to
  // opening a real browser tab.
  if (runtime?.runtime?.sendMessage) {
    try {
      const res = await runtime.runtime.sendMessage({
        type: "epix-open-config",
      });
      if (res?.ok) {
        return;
      }
    } catch {
      // background not reachable; fall through to a tab
    }
  }
  if (runtime?.tabs?.create) {
    runtime.tabs.create({ url: DASHBOARD_CONFIG_URL });
  } else {
    window.open(DASHBOARD_CONFIG_URL, "_blank");
  }
}

/**
 * The Epix Network panel: Tor + I2P status, our onion / i2p addresses, the
 * "route clearnet through Tor" toggle, and the per-site clearnet allowances,
 * plus a link to the node's full config page. Used inside a modal opened from
 * the header shield and from the pre-login screen (it talks to the node's
 * native host, so it works before unlock). `onClose` closes that modal after
 * opening the config tab.
 */
export const EpixNetworkPanel: FunctionComponent<{
  onClose?: () => void;
  // A bottom sheet rounds only its top corners; a centered card rounds all
  // four (used where the panel floats, e.g. the register page).
  rounded?: boolean;
}> = ({ onClose, rounded }) => {
  const intl = useIntl();
  const theme = useTheme();
  const isLight = theme.mode === "light";

  const {
    available,
    status,
    torClearnet,
    allowedSites,
    setTorClearnet,
    revokeSite,
  } = useEpixStatus();

  const sub = isLight ? ColorPalette["gray-300"] : ColorPalette["gray-200"];
  const card = isLight ? ColorPalette["gray-50"] : ColorPalette["gray-500"];
  const mono = isLight ? ColorPalette["gray-400"] : ColorPalette["gray-100"];

  const torText = (() => {
    if (!status)
      return intl.formatMessage({ id: "page.setting.epix.tor.unknown" });
    if (status.tor_enabled && torClearnet)
      return intl.formatMessage({ id: "page.setting.epix.tor.routed" });
    if (status.tor_enabled)
      return intl.formatMessage({ id: "page.setting.epix.tor.ready" });
    if (status.tor_status === "Bootstrapping")
      return intl.formatMessage({ id: "page.setting.epix.tor.connecting" });
    return intl.formatMessage({ id: "page.setting.epix.tor.off" });
  })();

  const i2pText = (() => {
    if (!status)
      return intl.formatMessage({ id: "page.setting.epix.i2p.unknown" });
    if (!i2pOn(status))
      return intl.formatMessage({ id: "page.setting.epix.i2p.off" });
    if (status.i2p_enabled || (status.i2p_status || "").startsWith("Ready"))
      return intl.formatMessage({ id: "page.setting.epix.i2p.ready" });
    if ((status.i2p_status || "").startsWith("Failed"))
      return intl.formatMessage({ id: "page.setting.epix.i2p.failed" });
    return intl.formatMessage({ id: "page.setting.epix.i2p.connecting" });
  })();

  return (
    <Box
      padding="1.25rem"
      backgroundColor={
        isLight ? ColorPalette["white"] : ColorPalette["gray-600"]
      }
      style={{
        borderTopLeftRadius: "1.25rem",
        borderTopRightRadius: "1.25rem",
        borderBottomLeftRadius: rounded ? "1.25rem" : undefined,
        borderBottomRightRadius: rounded ? "1.25rem" : undefined,
      }}
    >
      <Subtitle2>
        {intl.formatMessage({ id: "page.setting.epix.title" })}
      </Subtitle2>
      <Gutter size="1rem" />

      {!available ? (
        <Body3 color={sub}>
          {intl.formatMessage({ id: "page.setting.epix.unavailable" })}
        </Body3>
      ) : null}

      <Stack gutter="0.75rem">
        {/* Tor */}
        <Box padding="1rem" borderRadius="0.5rem" backgroundColor={card}>
          <Columns sum={1} alignY="center" gutter="0.5rem">
            <StatusDot color={torColor(status, torClearnet)} />
            <Subtitle3>
              {intl.formatMessage({ id: "page.setting.epix.tor" })}
            </Subtitle3>
            <Column weight={1} />
            <Body3 color={sub}>{torText}</Body3>
          </Columns>
          {status?.onion_address ? (
            <React.Fragment>
              <Gutter size="0.5rem" />
              <Body3 color={mono} style={{ wordBreak: "break-all" }}>
                {status.onion_address}.onion
              </Body3>
            </React.Fragment>
          ) : null}
          <Gutter size="0.75rem" />
          <Columns sum={1} alignY="center">
            <Body2>
              {intl.formatMessage({ id: "page.setting.epix.route-clearnet" })}
            </Body2>
            <Column weight={1} />
            <Toggle
              isOpen={torClearnet}
              setIsOpen={(v) => setTorClearnet(v)}
              size="small"
            />
          </Columns>
        </Box>

        {/* I2P */}
        <Box padding="1rem" borderRadius="0.5rem" backgroundColor={card}>
          <Columns sum={1} alignY="center" gutter="0.5rem">
            <StatusDot color={i2pColor(status)} />
            <Subtitle3>
              {intl.formatMessage({ id: "page.setting.epix.i2p" })}
            </Subtitle3>
            <Column weight={1} />
            <Body3 color={sub}>{i2pText}</Body3>
          </Columns>
          {status?.i2p_address ? (
            <React.Fragment>
              <Gutter size="0.5rem" />
              <Body3 color={mono} style={{ wordBreak: "break-all" }}>
                {status.i2p_address}.i2p
              </Body3>
            </React.Fragment>
          ) : null}
        </Box>

        {/* Per-site clearnet allowances */}
        {allowedSites.length > 0 ? (
          <Box padding="1rem" borderRadius="0.5rem" backgroundColor={card}>
            <Subtitle3>
              {intl.formatMessage({ id: "page.setting.epix.clearnet-allowed" })}
            </Subtitle3>
            <Gutter size="0.5rem" />
            <Stack gutter="0.5rem">
              {allowedSites.map((site) => (
                <Columns sum={1} alignY="center" key={site}>
                  <Body3 style={{ wordBreak: "break-all" }}>{site}</Body3>
                  <Column weight={1} />
                  <Box
                    cursor="pointer"
                    onClick={() => revokeSite(site)}
                    paddingX="0.5rem"
                  >
                    <Body3 color={ColorPalette["red-300"]}>
                      {intl.formatMessage({
                        id: "page.setting.epix.clearnet-revoke",
                      })}
                    </Body3>
                  </Box>
                </Columns>
              ))}
            </Stack>
          </Box>
        ) : null}
      </Stack>

      <Gutter size="1rem" />
      <Box
        cursor="pointer"
        onClick={() => {
          openDashboardConfig();
          onClose?.();
        }}
        alignX="center"
      >
        <Body2 color={ColorPalette["purple-300"]}>
          {intl.formatMessage({ id: "page.setting.epix.open-config" })}
        </Body2>
      </Box>
    </Box>
  );
};
