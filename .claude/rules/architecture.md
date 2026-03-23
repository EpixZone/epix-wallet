# Architecture Notes

## Package Direction

The extension app sits at the top of the dependency graph.

Typical flow:

- `packages/types`, `packages/unit`, `packages/common`: shared foundations
- `packages/background`: background services and routing
- `packages/stores*`: reactive client-side state and query layers
- `packages/hooks*`: workflow and form logic on top of stores
- `apps/extension`: UI entry point

## Runtime Shape

- Webpage calls providers
- Content scripts bridge requests
- Background handles permissions, keyring, chains, and transactions
- Popup/extension UI consumes stores backed by the background

## Chain Model

- Use `ModularChainInfo` as the current chain model
- The active chain types are `cosmos`, `ethermint`, `evm`, `starknet`, and `bitcoin`
- Structural rules live in `modular-chain.md`

## Change Bias

- Prefer small changes that preserve existing boundaries
- Avoid introducing new cross-layer dependencies
- Prefer extending existing stores, hooks, and message routes over creating parallel patterns
