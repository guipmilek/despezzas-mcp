# Despezzas MCP Agent Architecture Map

Use this file when deciding source ownership. Keep `AGENTS.md` short; put detailed
architecture and ownership notes here.

## Source Roots

- `src/index.ts`: CLI entrypoint. Selects stdio or HTTP transport based on config.
- `src/server.ts`: MCP server factory and tool registration entrypoint.
- `src/tools.ts`: MCP tool catalog, schemas, handlers, validation, and write guards.
- `src/client.ts`: Despezzas API client and endpoint-specific request helpers.
- `src/auth.ts`: Despezzas/Firebase authentication, token refresh, and local session file logic.
- `src/httpApp.ts`: Express app for `/health`, `/auth/status`, `/login`, OAuth discovery,
  OAuth routes, and `/mcp`.
- `src/cloudflare.ts`: Cloudflare Workers HTTP app, OAuth flow, multi-user session handling,
  and Worker-compatible logging.
- `src/cloudflareSessions.ts`: encrypted Worker KV storage for Despezzas sessions.
- `src/oauth.ts`: MCP OAuth client registration, authorization codes, access tokens, and validation.
- `src/ownerAuth.ts`: owner authorization code validation.
- `src/config.ts`: environment variable parsing and runtime defaults.
- `src/loginPage.ts`: login/authorization page HTML.
- `src/response.ts`: MCP response helpers, error helpers, and `confirm: true` guard behavior.
- `src/dates.ts`: date normalization helpers.
- `src/types.ts`: shared TypeScript payload and domain types.

## Test Owners

- `test/tools.test.mjs`: MCP tool validation, confirmation guard behavior, and payload safety.
- `test/write-tools-confirmation.test.mjs`: runtime registration checks that write/destructive tools expose confirmation and do not call the API client before confirmation.
- `test/cloudflare.test.mjs`: Worker/OAuth/session behavior that can be tested locally.
- `test/login-page.test.mjs`: login page rendering and safety expectations.

## Script Owners

- `scripts/inspect-har.mjs`: redacted inspection of HAR captures for Despezzas endpoints.
- `scripts/request-monitor-devtools.js`: browser DevTools helper for capturing API calls.
- `scripts/smoke-readonly.mjs`: live read-only smoke test using configured authentication.
- `scripts/check-repo-safety.mjs`: local guard against sensitive files and unsafe generated edits.
- `scripts/check-mcp-tools.mjs`: local guard for MCP tool catalog drift and visible write guards.

## MCP Tool Change Checklist

1. Add or update schema in `src/tools.ts`.
2. Reuse response helpers from `src/response.ts`.
3. Reuse API client helpers from `src/client.ts`.
4. Keep write/destructive behavior behind `confirm: true`.
5. Add tests in `test/tools.test.mjs` for validation and dangerous ambiguity.
6. Update `llms.txt` when tool names, payload fields, or safety rules change.
7. Update README/docs when user-facing behavior changes.
8. Run `npm run check:mcp-tools`.
9. Run `npm run verify`.

## API Endpoint Change Checklist

1. Confirm the endpoint from source, redacted HAR output, or a live read-only check.
2. Keep endpoint-specific request code in `src/client.ts`.
3. Normalize dates, money, account/card/category IDs, and optional fields before writes.
4. Avoid leaking raw response bodies in errors.
5. Add tests for shape changes where local validation is possible.
6. Update `docs/despezzas-api-notes.md` when endpoint behavior is discovered or corrected.

## Auth And OAuth Checklist

1. Keep Despezzas/Firebase login behavior in `src/auth.ts`.
2. Keep MCP OAuth behavior in `src/oauth.ts`, `src/httpApp.ts`, and `src/cloudflare.ts`.
3. Never expose Despezzas passwords as MCP tool arguments.
4. Never log refresh tokens, ID tokens, Authorization headers, owner auth codes, or sessions.
5. For Cloudflare multi-user sessions, preserve encryption and KV scoping.
6. Update `docs/chatgpt-app-setup.md` and `docs/cloudflare-workers.md` when OAuth behavior changes.

## Deployment Checklist

Remote deployment support is Cloudflare Workers-only. Local Node HTTP remains a
development/private-use transport, not a maintained remote deploy target.

Use the owner file for the target:

- Cloudflare Workers: `wrangler.jsonc`, `src/cloudflare.ts`, `docs/cloudflare-workers.md`.
- Deployment notes: `docs/deployment.md`.

Run the narrow deployment check when relevant:

```powershell
npm run check:cloudflare
```
