# Design System

- Use `DSColor` semantic tokens for all colors — they switch with dark/light theme automatically
- Use `DSTypography` component for all text styling
- Use DS icons from `@keplr-wallet/design-system` for all icons
- Use DS components when available — check `packages/design-system/src/components/`
- Use `DSColor` semantic tokens instead of `props.theme.mode` branching for theming
- Generated files are synced from Figma — update with `yarn workspace @keplr-wallet/design-system sync:tokens`

## Reference Paths

- Colors: `packages/design-system/src/foundation/color/color.ts`
- Typography: `packages/design-system/src/foundation/typography/typography-tokens.ts`
- Icons: `packages/design-system/src/foundation/icon/components/`
- Components: `packages/design-system/src/components/`
