import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntlProvider } from "react-intl";
import type { EndpointHealthSnapshot } from "@keplr-wallet/background";
import {
  EndpointConnectionStatus,
  EndpointConnectionStatusProps,
} from "./index";

const snapshot: EndpointHealthSnapshot = {
  chainId: "epix_1916-1",
  preferred: {
    rpc: "https://preferred.test",
    rest: "https://preferred-rest.test",
    evmRpc: "https://preferred-evm.test",
  },
  effective: {
    rpc: "https://backup.test",
    rest: "https://backup-rest.test",
    evmRpc: "https://backup-evm.test",
  },
  manual: false,
  publicFallback: true,
  status: "backup",
  nextDueAt: 1,
  generation: 1,
  revision: 1,
  workerEpoch: "fixture",
  capabilities: {
    rpc: {
      endpoint: "https://backup.test/private?api_key=fixture-secret",
      status: "healthy",
    },
    rest: { endpoint: "https://backup-rest.test", status: "stale" },
    evmRpc: { endpoint: "https://backup-evm.test", status: "wrong-chain" },
  },
};
function render(overrides: Partial<EndpointConnectionStatusProps> = {}) {
  return renderToStaticMarkup(
    <IntlProvider locale="en">
      <EndpointConnectionStatus
        snapshot={snapshot}
        chainName="Epix"
        onCheck={async () => undefined}
        onRecommended={async () => undefined}
        onPublicFallback={async () => undefined}
        {...overrides}
      />
    </IntlProvider>
  );
}

it.each(["unknown", "checking", "healthy"] as const)(
  "home stays quiet while %s",
  (status) => {
    expect(render({ compact: true, snapshot: { ...snapshot, status } })).toBe(
      ""
    );
  }
);
it.each(["backup", "degraded", "unavailable"] as const)(
  "home exposes recovery and settings while %s",
  (status) => {
    const html = render({
      compact: true,
      snapshot: { ...snapshot, status },
      onSettings: () => undefined,
    });
    expect(html).toContain("Epix:");
    expect(html).toContain("Check connection");
    expect(html).toContain("Connection settings");
    expect(html).not.toContain("Use recommended connection");
    expect(html).not.toContain('type="checkbox"');
  }
);
it("settings distinguishes transport capabilities and hides endpoint credentials/path", () => {
  const html = render();
  for (const label of [
    "RPC",
    "REST",
    "EVM RPC",
    "Connected",
    "Blocks are out of date",
    "Wrong network",
    "backup.test",
    "Use recommended connection",
  ])
    expect(html).toContain(label);
  expect(html).not.toContain("fixture-secret");
  expect(html).not.toContain("/private");
});
it("public backups for a custom connection require an explicit unchecked opt-in", () => {
  const html = render({
    snapshot: { ...snapshot, manual: true, publicFallback: false },
  });
  expect(html).toContain('type="checkbox"');
  expect(html).not.toContain('checked=""');
  expect(html).toContain(
    "Allow public backups when this custom connection is unavailable"
  );
  expect(
    render({ snapshot: { ...snapshot, manual: true, publicFallback: true } })
  ).toContain('checked=""');
});
it("unsaved edits disable saved-connection checks and consent changes without hiding reset", () => {
  const html = render({
    hasUnsavedChanges: true,
    snapshot: { ...snapshot, manual: true },
  });
  expect(html).toContain("Save your endpoint changes before checking them.");
  expect(html).toMatch(/<input[^>]*disabled=""/);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Check connection/);
  expect(html).toContain("Use recommended connection");
});
it("checking disables duplicate recovery actions", () => {
  const html = render({ snapshot: { ...snapshot, status: "checking" } });
  expect(html).toContain("Checking connection");
  expect((html.match(/<button[^>]*disabled=""/g) ?? []).length).toBe(2);
});
