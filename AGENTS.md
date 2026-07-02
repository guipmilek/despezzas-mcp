# Despezzas MCP - Agent Instructions

## Project

This repository is an unofficial TypeScript MCP server for Despezzas personal finance data.
It can read and change real financial records, so agents must treat credentials, sessions,
HAR captures, API responses, and transaction data as sensitive.

Core source files live in `src/`. Build output lives in `dist/`.

## Mandatory Rules

1. Read `llms.txt` before non-trivial code changes.
2. Keep write and destructive MCP tools gated by `confirm: true`.
3. Never commit `.env`, real tokens, passwords, Firebase sessions, session JSON files,
   unredacted HAR files, raw API responses, or personal finance data.
4. Do not manually edit `dist/` as a standalone change. Edit `src/` and run the build.
5. Use integer cents for money values. Example: `12345` means `R$123.45`.
6. Use `YYYY-MM-DD` dates for MCP tool inputs and API payload normalization.
7. Do not pass Despezzas passwords as MCP tool arguments. Use `.env` or `/login`.
8. Prefer existing helpers in `src/response.ts`, `src/client.ts`, `src/auth.ts`,
   `src/oauth.ts`, and `src/tools.ts` before adding parallel patterns.
9. Update `llms.txt`, `AGENTS.md`, and docs under `docs/` when changing architecture,
   commands, tool behavior, security rules, or agent conventions.

## Required Agent Workflow

For any non-trivial task, read and follow:

- `docs/agent-playbook.md`
- `docs/agent-task-template.md` when starting from a reusable AI-agent prompt.
- `docs/agent-architecture-map.md` when changing source ownership, MCP tools,
  auth, OAuth, deployment behavior, or tests.
- `PROJECT_PATHS.md` when paths outside this repo, local sessions, HAR files, or
  related projects are involved.

Minimum preflight:

```powershell
git status --short
Get-Location
Test-Path -LiteralPath '<target path>'
```

Use `rg` for search. Use `rg -F` for literal strings. Do not assume `grep` exists
in this Windows environment.

## Verification

Use the narrowest useful check first:

```powershell
npm run check:repo-safety
npm run check:mcp-tools
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify
npm run check:cloudflare
npm run smoke:readonly
```

Notes:

- `npm test` builds the TypeScript output and runs `node --test`.
- `npm run smoke:readonly` requires valid Despezzas authentication and calls
  read-only endpoints.
- `npm run check:cloudflare` validates Worker deployment shape, not live behavior.
- `npm run verify` includes `format:check`, so run `npm run format` before verification
  when changing formatted files.

## Source Ownership

- `src/tools.ts`: MCP tool schemas, handlers, validation, and write guards.
- `src/response.ts`: MCP responses, error formatting, and confirmation guard helpers.
- `src/client.ts`: Despezzas API client, request helper, and endpoint mapping.
- `src/auth.ts`: Despezzas/Firebase login, token refresh, and local session handling.
- `src/httpApp.ts`: Express HTTP server, `/login`, OAuth discovery, and `/mcp`.
- `src/cloudflare.ts`: Cloudflare Workers app, OAuth, sessions, and Worker logging.
- `src/cloudflareSessions.ts`: encrypted Worker KV session persistence.
- `src/oauth.ts`: OAuth token, client registration, authorization, and validation helpers.
- `src/config.ts`: environment parsing and runtime configuration.
- `src/loginPage.ts`: local/OAuth login page HTML.
- `test/`: Node test suite for tool validation, login page behavior, and Cloudflare paths.
- `scripts/`: local diagnostics, HAR inspection, smoke tests, and repo checks.

## Stop Rules

Stop and write a checkpoint instead of continuing blindly when any of these happen:

- The same tool or command fails three consecutive times for the same reason.
- A build, typecheck, or test failure is clearly outside the touched scope.
- A HAR/API capture contains unredacted sensitive values that cannot be safely summarized.
- The requested path is outside this repository and `PROJECT_PATHS.md` does not make it clear.
