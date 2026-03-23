# Keplr Wallet Notes

## Rules

Read the relevant files in `.claude/rules/` before making changes.
Pick the rule file that matches the area you are touching.

## Build and Typecheck

Running `yarn build` at the root is expensive. Use typecheck first.

- Typecheck only the modified package: `yarn workspace {package_name} typecheck`
- Typecheck all packages if needed: `yarn typecheck`
- Use builds only when actual build output is required
- When adding a new `@keplr-wallet/*` package, run `yarn check:gen`
