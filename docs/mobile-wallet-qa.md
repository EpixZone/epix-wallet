# Mobile wallet layout and navigation checks

Use a disposable wallet with public test data in the Epix Android emulator.
The native keyboard fix and wallet UI build must both be installed. See
`EpixNet/shells/tests.md` for Android build and keyboard instructions.

## Local checks

From the wallet repository root:

```sh
yarn workspace @keplr-wallet/extension typecheck
yarn workspace @keplr-wallet/extension test --runInBand src/pages/register/utils/navigation.test.ts src/components/modal/mobile-back.test.ts
```

Build the Firefox extension with the repository's normal build tooling. For an
incremental single-manifest development build, after the package typecheck:

```sh
NODE_ENV=production BUILD_MANIFEST_V2=true BUILD_OUTPUT=build/mobile-input-review \
  EPIX_TERMS_URL=https://techsonix.com/epixnet/terms/ \
  EPIX_PRIVACY_URL=https://techsonix.com/epixnet/privacy/ \
  yarn workspace @keplr-wallet/extension webpack
cd apps/extension
node <<'JS'
const fs = require("fs");
const merge = require("deepmerge");
const manifest = merge(require("./src/manifest.v2.json"), require("./src/manifest.v2.firefox.json"), {
  arrayMerge: (_, source) => source,
});
fs.writeFileSync("build/mobile-input-review/manifest.json", JSON.stringify(manifest, null, 2));
JS
```

Point EpixNet's `EPIX_WALLET_DIST` at that output directory. This does not change
the released wallet pin.

## Emulator checklist

- Small-phone introduction: animation runs, Create and Import are visible without
  scrolling, and long button labels wrap within their buttons. Check both
  640 × 1136 and 720 × 1280 emulator displays at density 320. The action group
  should sit near the viewport bottom with a consistent inset.
- Resize the introduction to a tall phone and tablet (1080 × 2160 and
  1600 × 2560 at density 320). The animation should grow in the space above the
  actions, preserve its aspect ratio, and keep every action visible. Return from
  Create/Import using Back and confirm the layout still fills the viewport.
- With enlarged text or a very short window, actions must retain their full
  labels and remain reachable by scrolling when they cannot all fit.
- Create: read safety warnings, reveal 12/24 words, and reach verification. Both
  verification fields must fit inside their card on a narrow screen.
- Import: tap a field and type with the soft keyboard, check all 24 fields remain
  reachable, switch to private key, and confirm validation errors are visible.
- Paste public BIP39 test vector `abandon` eleven times followed by `about`, with
  newlines or tabs between words. All 12 fields should fill and Import should
  advance. Never use this public phrase for funds.
- Advanced derivation settings: title does not overlap Close and numeric fields
  have usable width. Cancel/reset remains available.
- Name/password: invalid passwords show errors; fields remain visible above the
  keyboard. Completion shows Finish before external links.
- Navigation: use actual touch gestures when creating history entries. Back first
  hides the keyboard, then goes back one setup step. In-page Back resets scroll
  and dismisses the previous input. No secrets are stored in browser history.
- Deposit opens without a keyboard covering addresses. Search works when tapped;
  QR and Copy remain reachable. Android Back closes the modal before the wallet.
- Inspect home, settings, and transaction history with the unfunded test account.
  Do not submit transactions. Delete the test account afterward.

Automated tests cover setup history synchronization, discarded forms, multi-step
Back, listener cleanup, modal close, nested modal Back, and route transitions.
Hardware signing and network transactions require separate integration tests.
