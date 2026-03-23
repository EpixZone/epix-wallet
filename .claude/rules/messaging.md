# Messaging Rules

- Each service owns a `ROUTE`
- Message classes extend `Message<R>`
- Every message must define `type()`, `route()`, and `validateBasic()`
- Messages callable from webpages must explicitly override `approveExternal()` to return `true`

## Flow

1. Webpage or UI sends a message
2. Router forwards it to the background route
3. Service handles it
4. Errors cross the boundary through router serialization and reconstruction

## Error Handling

- Prefer typed errors such as `KeplrError` when the caller needs structured handling
- Be careful when changing message shapes because errors and approvals cross process boundaries
