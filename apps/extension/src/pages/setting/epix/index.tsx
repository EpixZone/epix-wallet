import React, { FunctionComponent, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { BackButton } from "../../../layouts/header/components";
import { HeaderLayout } from "../../../layouts/header";
import { Stack } from "../../../components/stack";
import { Box } from "../../../components/box";
import { Column, Columns } from "../../../components/column";
import { Body2, Body3, Subtitle3 } from "../../../components/typography";
import { Toggle } from "../../../components/toggle";
import { Gutter } from "../../../components/gutter";
import { ColorPalette } from "../../../styles";
import { useTheme } from "styled-components";

// The native-host status shape (see crates/epix-nmh + the node's
// /EpixNet-Internal/Status endpoint).
interface EpixStatus {
  serving?: boolean;
  tor_enabled?: boolean;
  tor_status?: string;
  onion_address?: string | null;
  i2p_enabled?: boolean;
  i2p_status?: string;
  i2p_address?: string | null;
  tor_clearnet?: boolean;
}

function sendToBackground(msg: object): Promise<any> {
  const runtime: any = (globalThis as any).browser?.runtime;
  if (!runtime?.sendMessage) {
    return Promise.reject(new Error("extension messaging unavailable"));
  }
  return runtime.sendMessage(msg);
}

// The color language of the desktop extension / the mobile shells' Tor badge.
const DOT_OFF = "#64748b";
const DOT_BOOT = "#f5c450";
const DOT_READY = "#a78bfa";
const DOT_ROUTED = "#4ade80";

const StatusDot: FunctionComponent<{ color: string }> = ({ color }) => (
  <Box
    width="0.625rem"
    height="0.625rem"
    borderRadius="50%"
    backgroundColor={color}
  />
);

export const SettingEpixPage: FunctionComponent = () => {
  const intl = useIntl();
  const theme = useTheme();
  const isLight = theme.mode === "light";

  const [status, setStatus] = useState<EpixStatus | null>(null);
  const [available, setAvailable] = useState(true);
  const [torClearnet, setTorClearnet] = useState(true);
  const [allowedSites, setAllowedSites] = useState<string[]>([]);

  const refresh = async () => {
    try {
      const res = await sendToBackground({ type: "epix-status" });
      if (res?.ok) {
        setStatus(res.status);
        setTorClearnet(res.status?.tor_clearnet !== false);
        setAvailable(true);
      } else {
        setAvailable(false);
      }
    } catch {
      setAvailable(false);
    }
    try {
      const list = await sendToBackground({ type: "epix-list-clearnet-allow" });
      if (list?.ok) {
        setAllowedSites(list.sites || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const torColor = (() => {
    if (!status) return DOT_OFF;
    if (status.tor_enabled) return torClearnet ? DOT_ROUTED : DOT_READY;
    if (status.tor_status === "Bootstrapping") return DOT_BOOT;
    return DOT_OFF;
  })();

  const i2pColor = (() => {
    if (!status) return DOT_OFF;
    if (status.i2p_enabled) return DOT_READY;
    if (status.i2p_status === "Bootstrapping") return DOT_BOOT;
    return DOT_OFF;
  })();

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
    if (status.i2p_enabled)
      return intl.formatMessage({ id: "page.setting.epix.i2p.ready" });
    if (status.i2p_status === "Bootstrapping")
      return intl.formatMessage({ id: "page.setting.epix.i2p.connecting" });
    return intl.formatMessage({ id: "page.setting.epix.i2p.off" });
  })();

  const onToggleTorClearnet = async () => {
    const next = !torClearnet;
    setTorClearnet(next);
    try {
      await sendToBackground({ type: "epix-set-tor-clearnet", on: next });
    } catch {
      setTorClearnet(!next); // revert on failure
    }
  };

  const onRevokeSite = async (site: string) => {
    setAllowedSites((s) => s.filter((x) => x !== site));
    try {
      await sendToBackground({
        type: "epix-set-clearnet-allow",
        site,
        allow: false,
      });
    } catch {
      // ignore; next refresh reconciles
    }
  };

  const subColor = isLight
    ? ColorPalette["gray-300"]
    : ColorPalette["gray-200"];
  const cardColor = isLight ? ColorPalette["white"] : ColorPalette["gray-600"];
  const monoColor = isLight
    ? ColorPalette["gray-400"]
    : ColorPalette["gray-100"];

  return (
    <HeaderLayout
      title={intl.formatMessage({ id: "page.setting.epix.title" })}
      left={<BackButton />}
    >
      <Box paddingX="0.75rem" paddingY="0.75rem">
        {!available ? (
          <Box padding="1rem">
            <Body2 color={subColor}>
              {intl.formatMessage({ id: "page.setting.epix.unavailable" })}
            </Body2>
          </Box>
        ) : null}

        <Stack gutter="0.75rem">
          {/* Tor */}
          <Box padding="1rem" borderRadius="0.5rem" backgroundColor={cardColor}>
            <Columns sum={1} alignY="center" gutter="0.5rem">
              <StatusDot color={torColor} />
              <Subtitle3>
                {intl.formatMessage({ id: "page.setting.epix.tor" })}
              </Subtitle3>
              <Column weight={1} />
              <Body3 color={subColor}>{torText}</Body3>
            </Columns>
            {status?.onion_address ? (
              <React.Fragment>
                <Gutter size="0.5rem" />
                <Body3 color={monoColor} style={{ wordBreak: "break-all" }}>
                  {status.onion_address}.onion
                </Body3>
              </React.Fragment>
            ) : null}
            <Gutter size="0.75rem" />
            <Columns sum={1} alignY="center">
              <Body2>
                {intl.formatMessage({
                  id: "page.setting.epix.route-clearnet",
                })}
              </Body2>
              <Column weight={1} />
              <Toggle
                isOpen={torClearnet}
                setIsOpen={onToggleTorClearnet}
                size="small"
              />
            </Columns>
          </Box>

          {/* I2P */}
          <Box padding="1rem" borderRadius="0.5rem" backgroundColor={cardColor}>
            <Columns sum={1} alignY="center" gutter="0.5rem">
              <StatusDot color={i2pColor} />
              <Subtitle3>
                {intl.formatMessage({ id: "page.setting.epix.i2p" })}
              </Subtitle3>
              <Column weight={1} />
              <Body3 color={subColor}>{i2pText}</Body3>
            </Columns>
            {status?.i2p_address ? (
              <React.Fragment>
                <Gutter size="0.5rem" />
                <Body3 color={monoColor} style={{ wordBreak: "break-all" }}>
                  {status.i2p_address}.i2p
                </Body3>
              </React.Fragment>
            ) : null}
          </Box>

          {/* Per-site clearnet allowances */}
          {allowedSites.length > 0 ? (
            <Box
              padding="1rem"
              borderRadius="0.5rem"
              backgroundColor={cardColor}
            >
              <Subtitle3>
                {intl.formatMessage({
                  id: "page.setting.epix.clearnet-allowed",
                })}
              </Subtitle3>
              <Gutter size="0.5rem" />
              <Stack gutter="0.5rem">
                {allowedSites.map((site) => (
                  <Columns sum={1} alignY="center" key={site}>
                    <Body3 style={{ wordBreak: "break-all" }}>{site}</Body3>
                    <Column weight={1} />
                    <Box
                      cursor="pointer"
                      onClick={() => onRevokeSite(site)}
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
      </Box>
    </HeaderLayout>
  );
};
