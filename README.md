# Epix Wallet

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Epix Wallet is a browser extension wallet for the Epix ecosystem. It is a fork of [Keplr Wallet](https://github.com/chainapsis/keplr-wallet) with the EPIX chain built in, and it keeps support for the other chains that ship with Keplr.

For dApp compatibility and to keep upstream merges simple, the fork keeps the `window.keplr` provider global and the `@keplr-wallet/*` package names. dApps that integrate Keplr work with Epix Wallet without changes.

## Getting help

- Bug reports and feature requests: [GitHub issues](https://github.com/EpixZone/epix-wallet/issues)
- Questions and support: [Epix Discord](https://discord.gg/bF2GKHgrfv)

## Repository layout

This is a Yarn workspaces monorepo managed with Lerna.

- `apps/extension`: the browser extension UI (popup, side panel, register pages) and chain config
- `apps/hooks-internal`, `apps/stores-internal`: hooks and stores used only by the apps
- `packages/background`: wallet core logic that runs in the background process (keyring, permissions, chains, transactions)
- `packages/provider`, `packages/provider-extension`: the `window.keplr` API injected into web pages
- `packages/stores`, `packages/stores-*`: reactive state and query layers built on MobX
- `packages/hooks`, `packages/hooks-*`: form and transaction logic on top of the stores
- `packages/types`, `packages/unit`, `packages/common`, `packages/crypto`, `packages/cosmos`: shared foundations

## Building the extension locally

### Requirements

- protoc v21.3 (recommended)

  ```sh
    # This script is example for mac arm64 user. for other OS, replace URL(starts with https://..) to be matched with your OS from https://github.com/protocolbuffers/protobuf/releases/tag/v21.3
    curl -Lo protoc-21.3.zip https://github.com/protocolbuffers/protobuf/releases/download/v21.3/protoc-21.3-osx-aarch_64.zip 
    unzip protoc-21.3.zip -d $HOME/protoc
    cp -r $HOME/protoc/include /usr/local
    cp -r $HOME/protoc/bin /usr/local
  ```

- [Node.js v18+](https://nodejs.org/)

Clone this repo and run:

```sh
yarn && yarn build
```

The extension build output is in `apps/extension/build/manifest-v3`. This output only works on Chrome, so use the other build outputs (`apps/extension/build/manifest-v2` or `apps/extension/build/firefox`) for other browsers. See [this page](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked) for instructions on loading the build output on Chrome.

### Development

- `yarn build:libs`: build every package except the extension (needed once before extension dev)
- `yarn workspace @keplr-wallet/extension dev`: build the extension in watch mode
- `yarn typecheck`: typecheck all packages, or `yarn workspace {package_name} typecheck` for one package
- `yarn test`: run tests
- `yarn lint-test` / `yarn lint-fix`: check or fix lint and formatting

## Note on the private submodule

The upstream repo references a private submodule (`apps/extension/src/keplr-wallet-private`) that is only available to Chainapsis. All primary features of the extension build and work without it.

## Attribution

Epix Wallet is based on [Keplr Wallet](https://github.com/chainapsis/keplr-wallet) by Chainapsis, licensed under the Apache 2.0 License.

## License

### Browser Extension

Apache 2.0 License
