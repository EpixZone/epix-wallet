# Store Patterns

- MobX stores must call `makeObservable(this)` in the constructor when decorators are used
- Use `@observable.ref` for reference replacement
- Use `@observable.shallow` for shallow container tracking
- Use `@computed` for derived state
- Use `@action` for synchronous batched updates
- Use `@flow` for async store operations

## Observable Queries

- Queries are lifecycle-driven and may start on observation
- Respect query address formats and chain-specific query types
- Do not mix query identity with UI identity

## Store Composition

- Prefer existing store composition patterns over ad hoc state layering
- Use lazy keyed stores consistently for per-chain and per-account state
- Treat query changes as reactive infrastructure changes, not just local data plumbing
