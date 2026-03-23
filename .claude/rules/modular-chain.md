# ModularChainInfo Guidelines

## Chain Branching

- Use `type` for structural branching
- Do not use `in` checks to distinguish chain structure
- Read `unwrapped` first, then narrow

```ts
const u = modularChainInfo.unwrapped;

if (u.type === "cosmos" || u.type === "ethermint") {
  u.cosmos.bech32Config;
}
```

## `type` vs `isEthSignChain(...)`

- Use `type === "evm"` only for pure EVM chains
- Use `isEthSignChain(...)` or `type === "evm" || type === "ethermint"` for EVM capability
- Use `type === "cosmos" || type === "ethermint"` for Cosmos functionality

Do not default to `type === "evm"` without checking whether `ethermint` should be included.

## Ethermint

- Treat `ethermint` as a hybrid chain
- Use the Cosmos side for staking, rewards, IBC, and bech32-based queries
- Use the EVM side for ERC20, EVM signing, hex addresses, and EVM tx flows
- Default to the Cosmos side unless the flow is explicitly EVM-specific
- Do not duplicate the same logical data across both sides

EVM capability does not mean every product flow supports ethermint hex addresses.

## Query and Address Rules

Keep hex-search logic and bech32-search logic separate. Do not include pure EVM chains in bech32-only search paths.
