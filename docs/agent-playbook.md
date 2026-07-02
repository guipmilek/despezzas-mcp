# Despezzas MCP Agent Playbook

This file is the operating checklist for AI agents working in this repository. It exists
to reduce repeated context, wrong tool calls, and long recovery loops.

## Preflight

Run this before reading large files or editing anything:

1. Confirm the current directory:
   - `git status --short`
   - `Get-Location`
2. Confirm target paths exist before searching inside them:
   - `Test-Path -LiteralPath '<absolute path>'`
3. Use Windows-safe search:
   - Prefer `rg`.
   - Use `rg -F` for literal strings.
   - Use `Select-String -SimpleMatch` when PowerShell-native search is clearer.
   - Do not assume `grep` exists.
4. Classify the task:
   - MCP tool schema or handler
   - Despezzas API endpoint/client behavior
   - Authentication or session persistence
   - OAuth or HTTP transport
   - Cloudflare Workers deployment
   - Tests or safety validation
   - Documentation only
5. State the owner files before editing.
6. State the verification command before editing.

## Edit Ownership

- MCP tool definitions and write guards belong in `src/tools.ts`.
- Shared confirmation, response, and error helpers belong in `src/response.ts`.
- Despezzas endpoint calls and request plumbing belong in `src/client.ts`.
- Despezzas/Firebase login and local session behavior belong in `src/auth.ts`.
- Express HTTP routes belong in `src/httpApp.ts`.
- Cloudflare Worker routes and KV-backed sessions belong in `src/cloudflare.ts` and
  `src/cloudflareSessions.ts`.
- OAuth registration, authorization, token issue, and validation helpers belong in
  `src/oauth.ts`.
- Environment parsing belongs in `src/config.ts`.
- Login page markup belongs in `src/loginPage.ts`.
- Tests belong in `test/*.test.mjs`.
- Diagnostic scripts belong in `scripts/`.
- Deployment docs belong in `docs/`.

Avoid introducing a new helper when an existing one already owns the behavior.

## Security Rules

- Preserve `confirm: true` on every write or destructive tool.
- Add focused tests for new write paths, ambiguous payloads, and dangerous defaults.
- Never log secrets, raw Authorization headers, Firebase refresh tokens, full sessions,
  unredacted HAR content, or raw financial exports.
- Keep passwords out of MCP tool arguments. Use `.env` or `/login`.
- When mapping endpoints from HAR captures, use `npm run inspect:har -- <path>` and
  manually review redaction before sharing or committing any derived artifact.
- Treat undocumented Despezzas endpoints as unstable. Keep payload handling defensive.

## Verification Ladder

Use the narrowest check first, then broaden only when needed:

1. `npm run check:repo-safety`
2. `npm run check:mcp-tools`
3. `npm run format:check`
4. `npm run lint`
5. `npm run typecheck`
6. `npm test`
7. `npm run verify`
8. `npm run check:cloudflare` when Worker or deployment behavior changed.
9. `npm run smoke:readonly` only when live read-only API behavior needs validation.

Notes:

- `npm test` builds first.
- `npm run smoke:readonly` requires credentials and calls real read-only endpoints.
- `npm run verify` includes `format:check`; run `npm run format` before verification
  when changing formatted files.
- If full verification fails because of pre-existing or environment-only issues, run the
  most targeted useful command and report the limitation.

## Endpoint Capture Pattern

When adding or repairing Despezzas API behavior:

1. Start from existing helpers in `src/client.ts` and `src/tools.ts`.
2. Capture only the minimum network traffic needed.
3. Redact with `npm run inspect:har -- <path>`.
4. Add or update TypeScript payload normalization.
5. Add tests for required fields, dangerous ambiguity, and confirmation behavior.
6. Update `llms.txt` and docs when tool names, payload rules, or endpoints change.
7. Run `npm run check:mcp-tools` to catch stale tool references.

## Stop Rules

Stop and write a checkpoint instead of continuing blindly when any of these happen:

- Three consecutive command/tool errors from the same cause.
- More than 30 tool calls without a concrete edit or verified finding.
- Build/typecheck/test failure is clearly outside touched files.
- A HAR or API response contains secrets or personal finance data that cannot be safely
  redacted in the current context.
- A task references a path outside this repository and `PROJECT_PATHS.md` is ambiguous.

Checkpoint format:

```text
Goal:
Current cwd:
Touched files:
Evidence found:
Current blocker:
Next command:
Verification already run:
```
