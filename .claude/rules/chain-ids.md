# Chain ID Rules

## Formats

- Cosmos: `{identifier}-{version}`
- EVM-only: `eip155:{chainId}`
- Bitcoin: `bip122:{genesisHash}:{paymentType}`
- Starknet: `starknet:{network}`
- Ethermint: `{identifier}_{evmChainId}-{version}`

## Working Rules

- Treat `chainId` and `chainIdentifier` as different concepts
- Use `ChainIdHelper.parse(chainId).identifier` when logic depends on the identifier
- Do not manually split or trim chain IDs unless there is a strong reason
- Do not use ad hoc string parsing when `ChainIdHelper` already expresses the intent

## Practical Guidance

- Use full `chainId` when addressing a specific chain instance
- Use `chainIdentifier` when permissions, grouping, or matching must ignore version differences
- Do not treat linked chains as grouped by `chainId`; use `linkedChainKey`
- Remember that Bitcoin chain identity may include `paymentType`
