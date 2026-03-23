# Currency Rules

- `coinMinimalDenom` is the primary currency identifier
- Prefer `findCurrency(coinMinimalDenom)` over direct array lookups
- Use `forceFindCurrency()` only when a missing currency is truly impossible
- Use `DenomHelper.normalizeDenom()` when denom casing or prefixes may vary

## Common Denom Forms

- Native: `{denom}`
- IBC: `ibc/{hash}`
- CW20: `cw20:{contract}:{symbol}`
- Secret20: `secret20:{contract}:{name}`
- ERC20: `erc20:{contract}`
- Factory: `factory/{creator}/{subdenom}`
